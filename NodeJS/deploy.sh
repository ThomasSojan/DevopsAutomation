# Copyright © 2023 Safran Passenger Innovations, LLC. All rights reserved.
#!/bin/bash
# Description: Deployment script for s3 bucket that will hold the library dependencies for watchdog_lambda. This script will create a s3 bucket for watchdog_lambda function and copy the dependencies into it.
# This script is a pre-requisite for cloudformation/Automatically-start-and-stop-EC2-and-Neptune-DB-on-schedule-basis/resource_watchdog.yaml

# Dependencies - nodejs awscli, jq. To install any of the following, uncomment line 12.
# Prerequsits - 
# Download the repository to the local or do git pull to fetch any recent changes before running.
# AWS cli should be installed and configured with the root account credentials or the credentials should be configured in the environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_DEFAULT_REGION) 

# Install requirements
# sudo apt install nodejs awscli jq -y

usage() {
  echo "Usage: $0 <schedule> <monitor_ec2> <monitor_neptune>"
  echo "  <schedule>: Schedule format (e.g., 'rate(1 hour)', 'rate(5 minutes)')"
  echo "  <monitor_ec2>: true or false"
  echo "  <monitor_neptune>: true or false"
  exit 1
}

validate_schedule() {
  local pattern='^rate\([0-9]+ (hour|minute|minutes)\)$'
  if ! [[ $1 =~ $pattern ]]; then
    echo "Error: Invalid schedule format. Use the format 'rate(<number> hour|minute|minutes)'."
    usage
  fi
}

if [ "$#" -ne 3 ]; then
  usage
fi

SCHEDULE="$1"
MONITOR_EC2="$2"
MONITOR_NEPTUNE="$3"

validate_schedule "$SCHEDULE"

if [ "$MONITOR_EC2" != "true" ] && [ "$MONITOR_EC2" != "false" ]; then
  echo "Error: Invalid value for monitor_ec2. Accepted values are 'true' or 'false'."
  usage
fi

if [ "$MONITOR_NEPTUNE" != "true" ] && [ "$MONITOR_NEPTUNE" != "false" ]; then
  echo "Error: Invalid value for monitor_neptune. Accepted values are 'true' or 'false'."
  usage
fi
S3_BUCKET_STACK_NAME="smartpipe-resource-monitor-lambda-bucket"
RESOURCE_MONITOR_STACK_NAME="smartpipe-resource-monitor"
FILE_PATH="../../cloudformation/Automatically-start-and-stop-EC2-and-Neptune-DB-on-schedule-basis"


# Create zip archive
npm install
mkdir artifacts
zip -rq artifacts/EC2-watchdog-lambda-dependencies.zip EC2_watchdog.js node_modules
zip -rq artifacts/Neptune-watchdog-lambda-dependencies.zip Neptune_watchdog.js node_modules

# Run the cloudfromation template to create S3 bucket.
aws cloudformation deploy \
    --stack-name $S3_BUCKET_STACK_NAME \
    --template-file $FILE_PATH/cf-watchdog_lambda-s3-bucket.yaml \
    --no-fail-on-empty-changeset

S3_BUCKET_NAME=$(aws cloudformation list-stack-resources --stack-name $S3_BUCKET_STACK_NAME | jq -r '.StackResourceSummaries[0] | .PhysicalResourceId')

aws s3 cp artifacts s3://$S3_BUCKET_NAME/ --recursive

aws cloudformation deploy \
    --template-file $FILE_PATH/resource_watchdog.yaml \
    --stack-name $RESOURCE_MONITOR_STACK_NAME \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
    ScheduleExpression="$SCHEDULE" \
    EnableEC2monitor="$MONITOR_EC2" \
    EnableNeptunemonitor="$MONITOR_NEPTUNE"
