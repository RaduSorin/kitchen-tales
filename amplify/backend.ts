import { defineBackend } from '@aws-amplify/backend'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { importRecipe, MODEL_ID } from './functions/import-recipe/resource'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { storage } from './storage/resource'

const backend = defineBackend({ auth, data, storage, importRecipe })

// Invite-only: nobody can create an account from the app.
// Family accounts are created by the owner in the Cognito console.
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
}

// The import function calls Claude on Amazon Bedrock through the EU
// cross-region inference profile, which routes to the model in EU regions.
const modelName = MODEL_ID.replace(/^eu\./, '')
backend.importRecipe.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['bedrock:InvokeModel'],
    resources: [
      `arn:aws:bedrock:*:*:inference-profile/${MODEL_ID}`,
      `arn:aws:bedrock:*::foundation-model/${modelName}`,
    ],
  }),
)
