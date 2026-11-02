import { defineBackend } from '@aws-amplify/backend'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { importRecipe } from './functions/import-recipe/resource'
import { generateStory } from './functions/generate-story/resource'
import { findCover } from './functions/find-cover/resource'
import { family } from './functions/family/resource'
import { MODEL_ID } from './shared/model'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { storage } from './storage/resource'

const backend = defineBackend({ auth, data, storage, importRecipe, generateStory, findCover, family })

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
backend.generateStory.resources.lambda.addToRolePolicy(invokeClaude)
backend.generateStory.resources.lambda.addToRolePolicy(
  new PolicyStatement({ actions: ['polly:SynthesizeSpeech'], resources: ['*'] }),
)
