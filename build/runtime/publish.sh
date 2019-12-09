#!/bin/bash

. ./config.sh

LAYER_NAME=lambci-base

FILENAME=${LAYER_NAME}.node-v${NODE_VERSION}.npm-v${NPM_VERSION}.aws-sdk-v${AWS_SDK_VERSION}.zip

REGIONS="$(aws ssm get-parameters-by-path --path /aws/service/global-infrastructure/services/lambda/regions \
  --query 'Parameters[].Value' --output text | tr '[:blank:]' '\n' | grep -v -e ^cn- -e ^us-gov- | sort -r)"

aws s3api put-object --bucket lambci --key layers/${FILENAME} --body layer.zip

for region in $REGIONS; do
  aws s3api copy-object --region $region --copy-source lambci/layers/${FILENAME} \
    --bucket lambci-${region} --key layers/${FILENAME} && \
  aws lambda add-layer-version-permission --region $region --layer-name $LAYER_NAME \
    --statement-id sid1 --action lambda:GetLayerVersion --principal '*' \
    --version-number $(aws lambda publish-layer-version --region $region --layer-name $LAYER_NAME \
      --content S3Bucket=lambci-${region},S3Key=layers/${FILENAME} \
      --description "Node.js v${NODE_VERSION} runtime w/ npm v${NPM_VERSION} and aws-sdk v${AWS_SDK_VERSION}" \
      --query Version --output text) &
done

for job in $(jobs -p); do
  wait $job
done
