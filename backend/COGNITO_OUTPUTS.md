# Cognito handoff (us-east-1)

These are public identifiers for Person A's API configuration and Person C's
frontend configuration. Cognito app clients are public clients; neither has a
client secret. Do not place user passwords, tokens, or identity data in this
file.

## Customer portal

- User pool ID: `us-east-1_8Q9onMEne`
- Issuer: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_8Q9onMEne`
- App client ID: `1rtg8t1nbggjsf2i0d8g7jqqov`
- Client name: `pramana-customers-web`
- Email sign-in and email verification are enabled; customer self-registration
  is enabled.
- OAuth authorization-code flow and `http://localhost:3000/` callback are
  configured for development. Replace/add production callback URLs only after
  Person C provides the final frontend origin.
- Live client inspection on 2026-10-29 found `ALLOW_USER_SRP_AUTH` and refresh
  auth enabled; customer password auth is also enabled but not used by the
  application. Amplify SRP owns sign-in/session refresh/sign-out for both roles.
- The customer pool has immutable custom attributes `date_of_birth`,
  `address_line1`, `address_line2`, `city`, `state`, and `pincode`. `gender` is
  the standard Cognito attribute (not `custom:gender`).

## Reviewer portal

- User pool ID: `us-east-1_IQzz0ktCu`
- Issuer: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_IQzz0ktCu`
- App client ID: `5fh52722t9o0le48pieqavtcv0`
- Client name: `pramana-reviewers-web`
- Email sign-in is configured; reviewer self-registration is disabled
  (`AllowAdminCreateUserOnly=true`). Reviewers must be created administratively.
- The app client is public, supports SRP/user-auth and refresh-token auth, and
  has token revocation enabled.

## Integration notes

- Backend FastAPI validates Cognito access-token signature, `iss`, `exp`,
  `token_use=access`, and the matching pool's `client_id`. Access tokens use
  `client_id`; ID-token `aud` validation is not the token contract. Customer and
  reviewer pools are distinct; a valid token from one pool is rejected by the
  other role's dependency.
- Person A deployed outbound-only IPv6 egress without NAT or interface
  endpoints. A temporary read-only Lambda in the private subnets successfully
  called Cognito APIs and required AWS service APIs. AWS has since deleted the
  temporary stack, function, and IAM role. This proves the network route, not
  the deployed API Lambda integration.
- The pool resources pre-existed outside the current CloudFormation stacks.
  Their configuration was inspected and updated in place; do not create
  replacement pools. Future resource import/stack ownership should be coordinated
  with Person A.
- API Gateway URL and production callback origins are not available yet.
