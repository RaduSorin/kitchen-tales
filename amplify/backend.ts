import { defineBackend } from '@aws-amplify/backend'
import { Stack } from 'aws-cdk-lib'
import { Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { importRecipe } from './functions/import-recipe/resource'
import { generateStory } from './functions/generate-story/resource'
import { findCover } from './functions/find-cover/resource'
import { family } from './functions/family/resource'
import { timerAlarm } from './functions/timer-alarm/resource'
import { IMAGE_MODEL_ID, IMAGE_MODEL_REGION, MODEL_ID } from './shared/model'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { storage } from './storage/resource'

const backend = defineBackend({ auth, data, storage, importRecipe, generateStory, findCover, family, timerAlarm })

// Invite-only: nobody can create an account from the app.
// Family members invite each other from Settings (see functions/family).
// Merge rather than replace, so the invitation email template from auth/resource.ts is kept.
const cfnUserPool = backend.auth.resources.cfnResources.cfnUserPool
cfnUserPool.adminCreateUserConfig = {
  ...(cfnUserPool.adminCreateUserConfig as object | undefined),
  allowAdminCreateUserOnly: true,
}

// Both AI functions call Claude on Amazon Bedrock through the EU
// cross-region inference profile, which routes to the model in EU regions.
const modelName = MODEL_ID.replace(/^eu\./, '')
const invokeClaude = new PolicyStatement({
  actions: ['bedrock:InvokeModel'],
  resources: [
    `arn:aws:bedrock:*:*:inference-profile/${MODEL_ID}`,
    `arn:aws:bedrock:*::foundation-model/${modelName}`,
  ],
})
backend.importRecipe.resources.lambda.addToRolePolicy(invokeClaude)
// Recipe photos (Stable Image Core in us-west-2).
backend.importRecipe.resources.lambda.addToRolePolicy(new PolicyStatement({
  actions: ['bedrock:InvokeModel'],
  resources: [`arn:aws:bedrock:${IMAGE_MODEL_REGION}::foundation-model/${IMAGE_MODEL_ID}`],
}))
backend.generateStory.resources.lambda.addToRolePolicy(invokeClaude)
backend.generateStory.resources.lambda.addToRolePolicy(
  new PolicyStatement({ actions: ['polly:SynthesizeSpeech'], resources: ['*'] }),
)

// Voice dictation on the Add recipe screens: the browser streams microphone audio
// straight to Amazon Transcribe (Romanian) with the signed-in user's credentials.
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(new PolicyStatement({
  actions: ['transcribe:StartStreamTranscriptionWebSocket', 'transcribe:StartStreamTranscription'],
  resources: ['*'],
}))

// Cooking timer alarms: the function makes a one-time EventBridge Scheduler schedule per running
// timer, which invokes the same function at the end time to send the push notification.
const alarmFn = backend.timerAlarm.resources.lambda
const alarmStack = Stack.of(alarmFn)
const schedulerRole = new Role(alarmStack, 'TimerAlarmSchedulerRole', { assumedBy: new ServicePrincipal('scheduler.amazonaws.com') })
// A separate policy (not inline on the role), so the role does not depend on the function
// while the function's environment points at the role.
new Policy(alarmStack, 'TimerAlarmInvoke', {
  roles: [schedulerRole],
  statements: [new PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [alarmFn.functionArn, `${alarmFn.functionArn}:*`] })],
})
backend.timerAlarm.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn)
alarmFn.addToRolePolicy(new PolicyStatement({
  actions: ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule'],
  resources: [`arn:aws:scheduler:${alarmStack.region}:${alarmStack.account}:schedule/default/kt-*`],
}))
alarmFn.addToRolePolicy(new PolicyStatement({ actions: ['iam:PassRole'], resources: [schedulerRole.roleArn] }))
