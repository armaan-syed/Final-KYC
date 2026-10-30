#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
inspector_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${inspector_dir}/../.." && pwd)"
template_file="${inspector_dir}/template.yaml"
stack_name="${SCHEMA_INSPECTOR_STACK_NAME:-pramana-dev-schema-inspector}"
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

get_stack_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "${foundation_stack}" \
    --profile "${aws_profile}" \
    --region "${aws_region}" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue | [0]" \
    --output text
}

get_stack_parameter() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "${foundation_stack}" \
    --profile "${aws_profile}" \
    --region "${aws_region}" \
    --query "Stacks[0].Parameters[?ParameterKey=='${key}'].ParameterValue | [0]" \
    --output text
}

vpc_id="$(get_stack_output VPCId)"
subnet_a="$(get_stack_output PrivateSubnetAId)"
subnet_b="$(get_stack_output PrivateSubnetBId)"
database_sg="$(get_stack_output DatabaseSecurityGroupId)"
layer_arn="$(get_stack_output SharedNotificationsLayerArn)"
secret_arn="$(get_stack_parameter DatabaseSecretArn)"
database_host="$(get_stack_parameter RDSHost)"
database_name="$(get_stack_parameter DatabaseName)"
artifact_bucket="$(aws cloudformation describe-stacks \
  --stack-name aws-sam-cli-managed-default \
  --profile "${aws_profile}" \
  --region "${aws_region}" \
  --query "Stacks[0].Outputs[?OutputKey=='SourceBucket'].OutputValue | [0]" \
  --output text)"

if [[ -z "${secret_arn}" || "${secret_arn}" == "None" || -z "${database_host}" || "${database_host}" == "None" ]]; then
  printf 'Foundation stack does not have the existing RDS secret ARN and endpoint parameters.\n' >&2
  exit 1
fi

aws cloudformation validate-template \
  --template-body "file://${template_file}" \
  --profile "${aws_profile}" \
  --region "${aws_region}" >/dev/null
cfn-guard validate \
  --rules "${inspector_dir}/security.guard" \
  --data "${template_file}" \
  --type CFNTemplate

"${script_dir}/build.sh"
archive="$(mktemp --suffix=.zip)"
trap 'rm -f "${archive}"' EXIT
python3 - "${inspector_dir}/dist/package" "${archive}" <<'PY'
from pathlib import Path
import sys
import zipfile

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
    for file in sorted(source.rglob("*")):
        if file.is_file() and "__pycache__" not in file.parts and file.suffix != ".pyc":
            bundle.write(file, file.relative_to(source).as_posix())
PY

artifact_hash="$(sha256sum "${archive}" | cut -d ' ' -f 1)"
artifact_key="pramana/schema-inspector/${artifact_hash}.zip"
aws s3 cp "${archive}" "s3://${artifact_bucket}/${artifact_key}" \
  --profile "${aws_profile}" \
  --region "${aws_region}" \
  --sse AES256

if aws cloudformation describe-stacks --stack-name "${stack_name}" --profile "${aws_profile}" --region "${aws_region}" >/dev/null 2>&1; then
  change_set_type=UPDATE
else
  change_set_type=CREATE
fi
change_set_name="schema-inspector-$(date -u +%Y%m%dT%H%M%SZ)"
change_set_arn="$(aws cloudformation create-change-set \
  --stack-name "${stack_name}" \
  --change-set-name "${change_set_name}" \
  --change-set-type "${change_set_type}" \
  --template-body "file://${template_file}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
    "ParameterKey=VpcId,ParameterValue=${vpc_id}" \
    "ParameterKey=PrivateSubnetAId,ParameterValue=${subnet_a}" \
    "ParameterKey=PrivateSubnetBId,ParameterValue=${subnet_b}" \
    "ParameterKey=DatabaseSecurityGroupId,ParameterValue=${database_sg}" \
    "ParameterKey=DatabaseSecretArn,ParameterValue=${secret_arn}" \
    "ParameterKey=DatabaseHost,ParameterValue=${database_host}" \
    "ParameterKey=DatabaseName,ParameterValue=${database_name}" \
    "ParameterKey=SharedNotificationsLayerArn,ParameterValue=${layer_arn}" \
    "ParameterKey=ArtifactBucket,ParameterValue=${artifact_bucket}" \
    "ParameterKey=ArtifactKey,ParameterValue=${artifact_key}" \
  --profile "${aws_profile}" \
  --region "${aws_region}" \
  --query Id \
  --output text)"

printf '\nChange set prepared (not executed):\n%s\n\n' "${change_set_arn}"
printf 'Wait until CREATE_COMPLETE, inspect it, then execute only after reviewing every change:\n'
printf 'aws cloudformation describe-change-set --stack-name %s --change-set-name %s --profile %s --region %s --query "Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}"\n' \
  "${stack_name}" "${change_set_name}" "${aws_profile}" "${aws_region}"
printf 'aws cloudformation execute-change-set --stack-name %s --change-set-name %s --profile %s --region %s\n' \
  "${stack_name}" "${change_set_name}" "${aws_profile}" "${aws_region}"
