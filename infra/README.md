# Person A SAM foundation

`sam/template.yaml` is the first infrastructure slice for Person A. It defines
the private document bucket and its separate access-log bucket, the private
frontend bucket behind CloudFront OAC, and the encrypted standard OCR queue and
dead-letter queue. The S3 document bucket's CORS configuration permits browser
`PUT` requests from the CloudFront frontend origin; S3 policies and the signed
URL control authorization. Public S3 access is blocked on both application
buckets, and CloudFront OAC provides the public frontend delivery path.
Existing AWS administrators retain the access already granted to them.

The template intentionally does not create RDS, API routes, Cognito resources,
Lambda functions, queue event mappings, or a queue producer yet. Person B owns
Cognito provisioning; the database and worker message contracts are not
finalized; and the documents disagree about whether S3 or `POST /kyc/submit`
enqueues OCR. The trigger remains disabled until the team records one choice.
No AWS resources have been deployed from this template.

## Deployment gate

Do not deploy until the resource costs have been reviewed for the current AWS
account and Person A approves the concrete CloudFormation change set. CloudFront
is a billable resource even when it serves no traffic. Review the change set
before applying it. B/C IAM user and policy changes are explicitly outside this
stack and must remain untouched until Person A manually removes their access.

The template uses CloudFormation metadata to point back to this file and the
Person A context/plan. S3 buckets are retained if the stack is deleted; review
the retained resources before changing deletion behavior.
