// Copyright © 2023 Safran Passenger Innovations, LLC. All rights reserved.
const AWS = require('aws-sdk');
const cronParser = require('cron-parser');
const { DateTime } = require("luxon");
const ec2 = new AWS.EC2();

exports.lambda_handler = async (event) => {
    try {
        const ec2Instances = await listEC2Instances();
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        console.log(`Today : ${now.toISOString().split('T')[0]} || Time : ${now.toISOString().split('T')[1]}`);

        const ec2Actions = ec2Instances.map(async (instance) => {
            const tags = instance.Tags;
            const startTag = tags.find(tag => tag.Key === 'Start');
            const stopTag = tags.find(tag => tag.Key === 'Stop');
            const scriptStartTag = tags.find(tag => tag.Key === 'ScriptStarted');
            const scriptStopTag = tags.find(tag => tag.Key === 'ScriptStopped');
            const pauseTag = tags.find(tag => tag.Key === 'pauseSchedule');

            if (!pauseTag) {  

                if (startTag && !scriptStartTag && !stopTag && instance.State.Name === 'stopped') {                
                    if (now.toISOString().split('T')[0] === getpreviousScheduledTime(startTag)[1].toISOString().split('T')[0] && currentTime >= getpreviousScheduledTime(startTag)[0]) {
                        console.log(`The Ec2 instance ${instance.InstanceId} was scheduled to be started at ${getpreviousScheduledTime(startTag)[1]} as per the start schedule found in the startTag \nInitianting start sequence for ${instance.InstanceId}`);
                        await startInstance(instance.InstanceId);
                        await markEC2Resource('ScriptStarted',instance.InstanceId);
                    }
                }        
                if (stopTag && !scriptStopTag && !startTag && instance.State.Name === 'running' ) {                
                    if (now.toISOString().split('T')[0] === getpreviousScheduledTime(stopTag)[1].toISOString().split('T')[0] && currentTime >= getpreviousScheduledTime(stopTag)[0] ) {
                        console.log(`The Ec2 instance ${instance.InstanceId} was scheduled to be stopped at ${getpreviousScheduledTime(stopTag)[1]} as per the stop schedule found in the stopTag \nInitianting stop sequence for ${instance.InstanceId}`);
                        await stopInstance(instance.InstanceId);
                        await markEC2Resource('ScriptStopped',instance.InstanceId);
                    }
                }
                if (startTag && stopTag) {

                    if (isSameDate(startTag,stopTag) && now.toISOString().split('T')[0] === getpreviousScheduledTime(startTag)[1].toISOString().split('T')[0] ) {
                            
                        if (getpreviousScheduledTime(startTag)[0] < getpreviousScheduledTime(stopTag)[0]){

                            if ((currentTime >= getpreviousScheduledTime(startTag)[0] && currentTime < getpreviousScheduledTime(stopTag)[0]) && !scriptStartTag && instance.State.Name === 'stopped') {
                                console.log(`Discovered both start & stop tags intended for execution on the same day associated with ${instance.InstanceId} \n Since the instance was scheduled to start at ${getpreviousScheduledTime(startTag)[1]} , Initiating start sequence for ${instance.InstanceId}`);
                                await startInstance(instance.InstanceId);
                                await markEC2Resource('ScriptStarted',instance.InstanceId);
                            }
                            else if (currentTime >= getpreviousScheduledTime(stopTag)[0] && !scriptStopTag && instance.State.Name === 'running') {
                                console.log(`Discovered both start & stop tags intended for execution on the same day associated with ${instance.InstanceId} \n Since the instance was scheduled to be stopped at ${getpreviousScheduledTime(stopTag)[1]} , Initiating stop sequence for ${instance.InstanceId}`);
                                await stopInstance(instance.InstanceId);
                                await markEC2Resource('ScriptStopped',instance.InstanceId);
                            }
                        }
                        else if (getpreviousScheduledTime(startTag)[0] > getpreviousScheduledTime(stopTag)[0]){

                            if (currentTime >= getpreviousScheduledTime(startTag)[0] && !scriptStartTag && instance.State.Name === 'stopped') {
                                console.log(`Discovered both stop & start tags intended for execution on the same day associated with ${instance.InstanceId} \n Since the instance was scheduled to start at ${getpreviousScheduledTime(startTag)[1]} , Initiating start sequence for ${instance.InstanceId}`);
                                await startInstance(instance.InstanceId);
                                await markEC2Resource('ScriptStarted',instance.InstanceId);
                            }
                            else if ((currentTime >= getpreviousScheduledTime(stopTag)[0] && currentTime < getpreviousScheduledTime(startTag)[0]) && !scriptStopTag && instance.State.Name === 'running') {
                                console.log(`Discovered both stop & start tags intended for execution on the same day associated with ${instance.InstanceId} \n Since the instance was scheduled to be stopped at ${getpreviousScheduledTime(stopTag)[1]} , Initiating stop sequence for ${instance.InstanceId}`);
                                await stopInstance(instance.InstanceId);
                                await markEC2Resource('ScriptStopped',instance.InstanceId);
                            }
                        }
                    }
                    else if ((now.toISOString().split('T')[0] === getpreviousScheduledTime(startTag)[1].toISOString().split('T')[0]) && currentTime >= getpreviousScheduledTime(startTag)[0] && !scriptStartTag && instance.State.Name === 'stopped'  ){
                        console.log(`Discovered both start & stop tags intended for execution on different dates associated with ${instance.InstanceId} \n Since the instance was scheduled to start at ${getpreviousScheduledTime(startTag)[1]} , Initiating start sequence for ${instance.InstanceId}`);
                        await startInstance(instance.InstanceId);
                        await markEC2Resource('ScriptStarted',instance.InstanceId);
                    }
                    else if ((now.toISOString().split('T')[0] === getpreviousScheduledTime(stopTag)[1].toISOString().split('T')[0]) && currentTime >= getpreviousScheduledTime(stopTag)[0] && !scriptStopTag && instance.State.Name === 'running') {
                        console.log(`Discovered both start & stop tags intended for execution on different dates associated with ${instance.InstanceId} \n Since the instance was scheduled to be stopped at ${getpreviousScheduledTime(stopTag)[1]} , Initiating stop sequence for ${instance.InstanceId}`);
                        await stopInstance(instance.InstanceId);
                        await markEC2Resource('ScriptStopped',instance.InstanceId);
                    }
                }
                if (currentTime > 1410 || currentTime < 30 ){
                    if(scriptStartTag){
                        await removeEC2ResourceTag('ScriptStarted',instance.InstanceId);
                    }
                    if(scriptStopTag){
                        await removeEC2ResourceTag('ScriptStopped',instance.InstanceId);
                    }
                }
            }
            else if (pauseTag){
                console.log(`Pause Schedule Tag detected for ${instance.InstanceId}, skipping start/stop tag check ..`);
            }               
        });

        await Promise.all(ec2Actions);
    } catch (error) {
        console.error('Error in handler:', error);
    }
};

function isSameDate(startTag,stopTag){
    return getpreviousScheduledTime(startTag)[1].toISOString().split('T')[0] === getpreviousScheduledTime(stopTag)[1].toISOString().split('T')[0] ;
}

function getpreviousScheduledTime(tagKey) {
    const cronValue = tagKey.Value;
    const nextCronTime = cronParser.parseExpression(cronValue).prev().toDate();
    const timeInMinutes = nextCronTime.getHours() * 60 + nextCronTime.getMinutes();

    return [timeInMinutes, nextCronTime];
}

async function markEC2Resource(tag,resourceId) {
    try {
        const PacificTime = DateTime.now().setZone('America/Los_Angeles');
        const currentTime = PacificTime.toISO();
        const params = {
            Resources: [resourceId],
            Tags: [
                {
                    Key: tag,
                    Value: currentTime
                },
            ],
        };

        await ec2.createTags(params).promise();
        console.log(`${tag} tag with value ${currentTime} added successfully.`);
    } catch (error) {
        console.error('Error in markResource:', error.message);
        throw error;
    }
}

async function removeEC2ResourceTag(tag,resourceId) {
    try {
        const params = {
            Resources: [resourceId],
            Tags: [
                {
                    Key: tag
                }
            ]
        };

        await ec2.deleteTags(params).promise();
        console.log(`${tag} tag for ${resourceId} removed successfully.`);
    } catch (error) {
        console.error('Error in removeScriptStartedTag:', error);
        throw error;
    }
}

async function listEC2Instances() {
    try {
        const params = {
            Filters: [
                {
                    Name: 'tag-key',
                    Values: ['Start', 'Stop']
                }
            ]
        };
        const response = await ec2.describeInstances(params).promise();
        const instances = [];

        response.Reservations.forEach(reservation => {
            reservation.Instances.forEach(instance => {
                instances.push(instance);
            });
        });

        return instances;
    } catch (error) {
        console.error('Error in listInstances:', error);
        throw error;
    }
}

async function startInstance(instanceId) {
    try {
        const params = {
            InstanceIds: [instanceId]
        };

        await ec2.startInstances(params).promise();
    } catch (error) {
        console.error('Error in startInstance:', error);
        throw error;
    }
}

async function stopInstance(instanceId) {
    try {
        const params = {
            InstanceIds: [instanceId]
        };

        await ec2.stopInstances(params).promise();
    } catch (error) {
        console.error('Error in stopInstance:', error);
        throw error;
    }
}
