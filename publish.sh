#!/bin/bash -ex

REGIONS="$(aws ssm get-parameters-by-path --path /aws/service/global-infrastructure/services/lambda/regions \
  --query 'Parameters[].Value' --output text | tr '[:blank:]' '\n' | grep -v -e ^cn- -e ^us-gov- | sort -r)"

VERSION=$(npm run -s v)

echo $VERSION > /tmp/lambci.txt

aws s3api put-object --bucket lambci --key fn/lambci-build-${VERSION}.zip --body build/lambda.zip --acl public-read

aws s3api copy-object --copy-source lambci/fn/lambci-build-${VERSION}.zip --bucket lambci --key fn/lambci-build-latest.zip --acl public-read &

aws s3api put-object --bucket lambci --key fn/latest.txt --body /tmp/lambci.txt --acl public-read &

npm run template
aws s3api put-object --bucket lambci --key templates/lambci.template --body build/versioned.yaml --acl public-read &
aws s3api put-object --bucket lambci --key templates/template.yaml --body build/versioned.yaml --acl public-read &

for region in $REGIONS; do
  aws s3api copy-object --region $region --copy-source lambci/fn/lambci-build-${VERSION}.zip --bucket lambci-${region} --key fn/lambci-build-${VERSION}.zip --acl public-read && \
  aws s3api copy-object --region $region --copy-source lambci-${region}/fn/lambci-build-${VERSION}.zip --bucket lambci-${region} --key fn/lambci-build-latest.zip --acl public-read &
done

for job in $(jobs -p); do
  wait $job
done

rm /tmp/lambci.txt
