// Automation code to start and stop the ec2 instance based on the start and stop tag specified in the ec2 instance. The value of the start or stop tag will be a cron expression.

const AWS = require('aws-sdk');
const cronParser = require('cron-parser');
const { DateTime } = require("luxon");
const ec2 = new AWS.EC2({ region: 'ap-south-1' });


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
            
            if (startTag && !scriptStartTag && !stopTag && instance.State.Name === 'stopped') {
                
                if (now.toISOString().split('T')[0] === getScheduledTime(startTag)[1].toISOString().split('T')[0] && currentTime >= getScheduledTime(startTag)[0]) {
                    console.log(`startTime for ${instance.InstanceId} : ${getScheduledTime(startTag)[1]}`);
                    console.log(`Starting Instance: ${instance.InstanceId}`);
                    await startInstance(instance.InstanceId);
                    await markEC2ResourceAsScriptStarted(instance.InstanceId);
                }
                if (scriptStopTag) {
                    await removeEC2ScriptStoppedTag(instance.InstanceId);
                }
            }
        
            if (stopTag && !scriptStopTag && !startTag && instance.State.Name === 'running') {
                
                if (now.toISOString().split('T')[0] === getScheduledTime(stopTag)[1].toISOString().split('T')[0] && currentTime >= getScheduledTime(stopTag)[0]) {
                    console.log(`stopTime for ${instance.InstanceId} : ${getScheduledTime(stopTag)[1]}`);
                    console.log(`Stopping Instance: ${instance.InstanceId}`);
                    await stopInstance(instance.InstanceId);
                    await markEC2ResourceAsScriptStopped(instance.InstanceId);
                }

                if (scriptStartTag) {
                    await removeEC2ScriptStartedTag(instance.InstanceId);
                }
            }
            if (startTag && stopTag) {

                // #################### Work Around ##########################

                if (instance.State["Name"] === "stopped"){
                    console.log("Instance is stopped. Need to start");
                    nextTime = getnextTime(startTag);
                    prevTime = getprevTime(startTag);
                    currentTimeInMinutes = now.getHours()*60 + now.getMinutes();
                    console.log("next starting time is "+ nextTime);
                    console.log("previous starting time is "+ prevTime);
                    if(isDateToday(nextTime[1]) || isDateToday(prevTime[1]) ){
                        if(currentTimeInMinutes >= nextTime[0] && currentTimeInMinutes <= nextTime[0] + 30 ){
                            await startInstance(instance.InstanceId);
                            console.log("Instance is starting....");
                        }
                    }
                    
                    
                }

                else if (instance.State["Name"] === "running"){
                    console.log("Instance is running. Need to stop");
                    nextTime = getnextTime(stopTag);
                    prevTime = getprevTime(stopTag);
                    currentTimeInMinutes = now.getHours()*60 + now.getMinutes();
                    console.log("next stopping time is "+ nextTime);
                    console.log("previous stopping time is "+ prevTime);
                    if(isDateToday(nextTime[1]) || isDateToday(prevTime[1]) ){
                        if(currentTimeInMinutes >= nextTime[0] && currentTimeInMinutes <= nextTime[0] + 30 ){
                            await stopInstance(instance.InstanceId);
                            console.log("Instance is stopped....");
                        }
                    }
                }

                else{
                    console.log("instanceState: ", instance.State["Name"]);
                    
                }
                
                
            }
        if (currentTime > 1380 || currentTime < 30 ){
            clearScriptTags(scriptStartTag,scriptStopTag,instance);
        }
    
    
    
    });

      
       

        await Promise.all(ec2Actions);
    } catch (error) {
        console.error('Error in handler:', error);
    }
};

//clearing scriptTags
function clearScriptTags(scriptStartTag,scriptStopTag,instance){
    if(scriptStartTag){
        removeEC2ScriptStartedTag(instance.InstanceId);
        console.log("ScriptStartTag successfully cleared for "+instance.InstanceId);
    }
    if(scriptStopTag){
        removeEC2ScriptStoppedTag(instance.InstanceId);
        console.log("ScriptStopTag successfully cleared for "+instance.InstanceId);
    }
}

//get next cron time
function getnextTime(tagKey) {
    const cronValue = tagKey.Value;
    const nextCronTime = cronParser.parseExpression(cronValue).next().toDate();
    const timeInMinutes = nextCronTime.getHours() * 60 + nextCronTime.getMinutes();
    return [timeInMinutes, nextCronTime];
}

//get previous cron time
function getprevTime(tagKey) {
    const cronValue = tagKey.Value;
    const nextCronTime = cronParser.parseExpression(cronValue).prev().toDate();
    const timeInMinutes = nextCronTime.getHours() * 60 + nextCronTime.getMinutes();
    return [timeInMinutes, nextCronTime];
}

//check whether the cron date is today or not
function isDateToday(dateString) {
    
    const inputDate = new Date(dateString);
    const currentDate = new Date();
    const inputYear = inputDate.getFullYear();
    const inputMonth = inputDate.getMonth();
    const inputDay = inputDate.getDate();
    //const inputHours = inputDate.getHours();
    //const inputMinutes = inputDate.getMinutes();
    //console.log(inputYear,inputMonth,inputDay,inputHours,inputMinutes);
    
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDate();
    //const currentHours = currentDate.getHours();
    //const currentMinutes = currentDate.getMinutes();
    //console.log(currentYear,currentMonth,currentDay,currentHours,currentMinutes);

    return inputYear === currentYear &&
           inputMonth === currentMonth &&
           inputDay === currentDay;
}

function getScheduledTime(tagKey) {
    const cronValue = tagKey.Value;
    const nextCronTime = cronParser.parseExpression(cronValue).prev().toDate();
    const timeInMinutes = nextCronTime.getHours() * 60 + nextCronTime.getMinutes();
    return [timeInMinutes, nextCronTime];
}



async function markEC2ResourceAsScriptStarted(resourceId) {
    try {
        const PacificTime = DateTime.now().setZone('America/Los_Angeles');
        const currentTime = PacificTime.toISO();
        const params = {
            Resources: [resourceId],
            Tags: [
                {
                    Key: 'ScriptStarted',
                    Value: currentTime
                },
            ],
        };

        await ec2.createTags(params).promise();
        console.log('ScriptStarted tag added successfully.');
    } catch (error) {
        console.error('Error in markResourceAsScriptStarted:', error.message);
        throw error;
    }
}

async function removeEC2ScriptStartedTag(resourceId) {
    try {
        const params = {
            Resources: [resourceId],
            Tags: [
                {
                    Key: 'ScriptStarted'
                }
            ]
        };

        await ec2.deleteTags(params).promise();
        console.log('ScriptStarted tag removed successfully.');
    } catch (error) {
        console.error('Error in removeScriptStartedTag:', error);
        throw error;
    }
}

async function markEC2ResourceAsScriptStopped(resourceId) {
    try {
        const PacificTime = DateTime.now().setZone('America/Los_Angeles');
        const currentTime = PacificTime.toISO();
        const params = {
            Resources: [resourceId],
            Tags: [
                {
                    Key: 'ScriptStopped',
                    Value: currentTime
                },
            ],
        };

        await ec2.createTags(params).promise();
        console.log('ScriptStopped tag added successfully.');
    } catch (error) {
        console.error('Error in markResourceAsScriptStopped:', error.message);
        throw error;
    }
}

async function removeEC2ScriptStoppedTag(resourceId) {
    try {
        const params = {
            Resources: [resourceId],
            Tags: [
                {
                    Key: 'ScriptStopped'
                }
            ]
        };

        await ec2.deleteTags(params).promise();
        console.log('ScriptStopped tag removed successfully.');
    } catch (error) {
        console.error('Error in removeScriptStoppedTag:', error);
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
