#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
stack_dir="$(cd "${script_dir}/.." && pwd)"
template_file="${stack_dir}/template.yaml"
stack_name="${PSQL_ACCESS_STACK_NAME:-pramana-dev-admin-psql-access}"
foundation_stack="${FOUNDATION_STACK_NAME:-pramana-dev-foundation}"
aws_profile="${AWS_PROFILE:-pramana-iam-session}"
aws_region="${AWS_REGION:-us-east-1}"
expected_account="682197558335"

identity="$(aws sts get-caller-identity --profile "${aws_profile}" --region "${aws_region}" --output json)"
account="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["Account"])' <<<"${identity}")"
principal="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["Arn"])' <<<"${identity}")"
if [[ "${account}" != "${expected_account}" ]]; then
  printf 'Refusing deployment: profile %s resolved to account %s (%s), expected %s.\n' \
    "${aws_profile}" "${account}" "${principal}" "${expected_account}" >&2
  exit 1
fi
printf 'AWS identity verified: %s\n' "${principal}"

get_output() {
  local output_key="$1"
  aws cloudformation describe-stacks \
    --stack-name "${foundation_stack}" \
    --profile "${aws_profile}" \
    --region "${aws_region}" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue | [0]" \
    --output text
}

vpc_id="$(get_output VPCId)"
database_sg_id="$(get_output DatabaseSecurityGroupId)"
if [[ -z "${vpc_id}" || "${vpc_id}" == "None" || -z "${database_sg_id}" || "${database_sg_id}" == "None" ]]; then
  printf 'Foundation stack is missing VPCId or DatabaseSecurityGroupId outputs.\n' >&2
  exit 1
fi

aws cloudformation validate-template \
  --template-body "file://${template_file}" \
  --profile "${aws_profile}" \
  --region "${aws_region}" >/dev/null
cfn-guard validate \
  --rules "${stack_dir}/security.guard" \
  --data "${template_file}" \
  --type CFNTemplate

if aws cloudformation describe-stacks --stack-name "${stack_name}" --profile "${aws_profile}" --region "${aws_region}" >/dev/null 2>&1; then
  change_set_type=UPDATE
else
  change_set_type=CREATE
fi
change_set_name="admin-psql-$(date -u +%Y%m%dT%H%M%SZ)"
change_set_arn="$(aws cloudformation create-change-set \
  --stack-name "${stack_name}" \
  --change-set-name "${change_set_name}" \
  --change-set-type "${change_set_type}" \
  --template-body "file://${template_file}" \
  --parameters \
    "ParameterKey=VpcId,ParameterValue=${vpc_id}" \
    "ParameterKey=DatabaseSecurityGroupId,ParameterValue=${database_sg_id}" \
  --profile "${aws_profile}" \
  --region "${aws_region}" \
  --query Id \
  --output text)"

printf '\nChange set prepared (not executed):\n%s\n\n' "${change_set_arn}"
printf 'Expected first create: one dedicated security group and one TCP 5432 ingress rule from that group to the existing database SG.\n'
printf 'Review before execution:\n'
printf 'aws cloudformation describe-change-set --stack-name %s --change-set-name %s --profile %s --region %s --query "Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}"\n' \
  "${stack_name}" "${change_set_name}" "${aws_profile}" "${aws_region}"
printf 'aws cloudformation execute-change-set --stack-name %s --change-set-name %s --profile %s --region %s\n' \
  "${stack_name}" "${change_set_name}" "${aws_profile}" "${aws_region}"
