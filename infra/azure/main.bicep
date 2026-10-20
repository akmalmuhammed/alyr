// ALYR on Azure Qatar Central (decision D-036, Linear ALY-10).
//
// One resource group holds everything: a private network, PostgreSQL 16 reachable only
// from inside it, Key Vault for every secret, a container registry, Container Apps for
// the web app, API and worker, and two jobs (migrations, nightly backup).
//
// Deployed in two passes by the founder (an Owner of the subscription), because the
// apps need their secrets and their images to exist first. See infra/azure/README.md.
//   Pass 1  deployApps=false   network, database, Key Vault, registry, environment, budget
//   Pass 2  deployApps=true    the three apps and the two jobs, at imageTag
// After that, the GitHub workflow deploys new images without touching this file.

targetScope = 'resourceGroup'

@description('Azure region. Qatar Central keeps data in Qatar (hard rule 2).')
param location string = 'qatarcentral'

@description('Short name used in every resource name.')
@minLength(3)
@maxLength(10)
param prefix string = 'alyr'

@description('Object ID of the person who sets secrets (az ad signed-in-user show --query id -o tsv).')
param operatorObjectId string

@description('Email for budget alerts.')
param alertEmail string

@description('Monthly budget in the billing currency; alerts at 80% spent and 100% forecast.')
param monthlyBudget int = 100

@description('First day of the budget period. Leave the default.')
param budgetStartDate string = utcNow('yyyy-MM-01')

@description('GitHub repository allowed to deploy, as owner/name.')
param githubRepository string = 'akmalmuhammed/alyr'

@description('PostgreSQL administrator name. Its password is set when deploying and then kept in Key Vault by the founder.')
param postgresAdminLogin string = 'alyradmin'

@secure()
@description('PostgreSQL administrator password. Typed by the founder at deploy time; never stored in the repository.')
param postgresAdminPassword string

@description('Days of point-in-time backups kept by Azure (7 to 35).')
@minValue(7)
@maxValue(35)
param postgresBackupDays int = 14

@description('Pass 2: create the apps and jobs. Secrets and images must exist first.')
param deployApps bool = false

@description('Image tag to run (the git commit the images were built from).')
param imageTag string = 'latest'

@description('production, or staging for a copy that keeps the chat simulator for demos.')
@allowed([ 'production', 'staging' ])
param alyrEnv string = 'production'

@description('Address the web app is reached at, for links in chats. Empty: the web app\'s Azure address.')
param publicWebUrl string = ''

@description('Where product photos are served from (Cloudflare R2 behind this address, D-039).')
param mediaBaseUrl string = 'https://media.alyr.qa'

@description('The R2 bucket that holds product photos.')
param mediaBucket string = 'alyr-media'

@description('Create the nightly backup job. Needs the backup secrets and BACKUP_DESTINATIONS first.')
param deployBackupJob bool = false

@description('Where backups go, as rclone remotes, for example "gcs:alyr-db-doha r2:alyr-db-eu".')
param backupDestinations string = 'gcs:alyr-db-doha r2:alyr-db-eu'

var suffix = uniqueString(resourceGroup().id)
var names = {
  logs: '${prefix}-logs'
  network: '${prefix}-net'
  appsIdentity: '${prefix}-apps-id'
  deployIdentity: '${prefix}-deploy-id'
  registry: take('${prefix}${suffix}', 50)
  keyVault: take('${prefix}-kv-${suffix}', 24)
  postgres: '${prefix}-pg-${suffix}'
  environment: '${prefix}-env'
  api: '${prefix}-api'
  worker: '${prefix}-worker'
  web: '${prefix}-web'
  migrateJob: '${prefix}-migrate'
  backupJob: '${prefix}-backup'
}
var tags = {
  app: 'alyr'
  decision: 'D-036'
}

// Built-in role IDs (the same in every Azure tenant).
var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  acrPush: '8311e382-0749-4cb8-b61a-304f252e45ec'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  keyVaultSecretsOfficer: 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c'
}

// ---------------------------------------------------------------- logs and identities

resource logs 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: names.logs
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    // Logs beyond 1 GB a day stop being collected rather than becoming a surprise bill.
    workspaceCapping: { dailyQuotaGb: 1 }
  }
}

// The apps' identity: pulls images and reads secrets. Holds no other rights.
resource appsIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: names.appsIdentity
  location: location
  tags: tags
}

// GitHub Actions signs in as this identity with a short-lived token (OIDC); no password
// or key is stored in GitHub. Only the main branch of ALYR's repository can use it.
resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: names.deployIdentity
  location: location
  tags: tags
}

resource githubFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2024-11-30' = {
  parent: deployIdentity
  name: 'github-main'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:ref:refs/heads/main'
    audiences: [ 'api://AzureADTokenExchange' ]
  }
}

// Deploying new images means updating the apps and running the migration job.
resource deployContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deployIdentity.id, roles.contributor)
  properties: {
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.contributor)
  }
}

// ---------------------------------------------------------------- network

// A private network: the database has no public address at all; only the apps reach it.
resource network 'Microsoft.Network/virtualNetworks@2025-05-01' = {
  name: names.network
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: [ '10.40.0.0/16' ] }
    subnets: [
      {
        name: 'apps'
        properties: {
          addressPrefix: '10.40.0.0/23'
          delegations: [ { name: 'apps', properties: { serviceName: 'Microsoft.App/environments' } } ]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.40.2.0/28'
          delegations: [ { name: 'postgres', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } } ]
        }
      }
    ]
  }
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${names.postgres}.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresDns
  name: 'alyr-net'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: network.id }
  }
}

// ---------------------------------------------------------------- database

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' = {
  name: names.postgres
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: postgresBackupDays, geoRedundantBackup: 'Disabled' }
    // Zone-redundant standby is not offered to new servers in Qatar Central yet (D-036).
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: network.properties.subnets[1].id
      privateDnsZoneArmResourceId: postgresDns.id
      publicNetworkAccess: 'Disabled'
    }
    authConfig: { passwordAuth: 'Enabled', activeDirectoryAuth: 'Disabled' }
  }
  dependsOn: [ postgresDnsLink ]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2025-08-01' = {
  parent: postgres
  name: 'alyr'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Bookings use btree_gist to refuse overlapping bookings (migration 0010). Azure only
// allows extensions on this list.
resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2025-08-01' = {
  parent: postgres
  name: 'azure.extensions'
  properties: { value: 'BTREE_GIST', source: 'user-override' }
}

// ---------------------------------------------------------------- secrets and images

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: names.keyVault
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

resource appsReadSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, appsIdentity.id, roles.keyVaultSecretsUser)
  scope: keyVault
  properties: {
    principalId: appsIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
  }
}

// The founder sets and changes secrets; agents never see them.
resource operatorWritesSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, operatorObjectId, roles.keyVaultSecretsOfficer)
  scope: keyVault
  properties: {
    principalId: operatorObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsOfficer)
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: names.registry
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource appsPullImages 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, appsIdentity.id, roles.acrPull)
  scope: registry
  properties: {
    principalId: appsIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull)
  }
}

resource deployPushImages 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, deployIdentity.id, roles.acrPush)
  scope: registry
  properties: {
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPush)
  }
}

// ---------------------------------------------------------------- the environment

resource appsEnv 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: names.environment
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: network.properties.subnets[0].id
      internal: false
    }
    // Consumption only: billed per second of use, no dedicated-plan management fee.
    workloadProfiles: [ { name: 'Consumption', workloadProfileType: 'Consumption' } ]
    zoneRedundant: false
  }
}

// ---------------------------------------------------------------- apps and jobs

var image = {
  api: '${registry.properties.loginServer}/alyr-api:${imageTag}'
  web: '${registry.properties.loginServer}/alyr-web:${imageTag}'
  backup: '${registry.properties.loginServer}/alyr-backup:${imageTag}'
}
var webUrl = empty(publicWebUrl) ? 'https://${names.web}.${appsEnv.properties.defaultDomain}' : publicWebUrl
// Built from the name, so it is known before the vault exists (Bicep requires that inside loops).
var vaultSecret = 'https://${names.keyVault}${az.environment().suffixes.keyvaultDns}/secrets/'

// Every secret is read from Key Vault by the apps' identity at start-up.
var apiSecretNames = [
  'database-url'
  'migration-url'
  'backup-url'
  'meta-app-secret'
  'meta-verify-token'
  'meta-access-token'
  'meta-phone-number-id'
  'meta-waba-id'
  'email-api-key'
  // Signs every customer's order and document link; the API and worker refuse to start
  // without it (ALY-112).
  'link-secret'
  // Product photos on R2 (D-039). A container's disk is wiped on restart, so without these
  // the API and worker refuse to start (ALY-63).
  'r2-account-id'
  'r2-access-key-id'
  'r2-secret-access-key'
]
var apiSecrets = [for s in apiSecretNames: {
  name: s
  keyVaultUrl: '${vaultSecret}${s}'
  identity: appsIdentity.id
}]
var apiEnv = [
  { name: 'ALYR_ENV', value: alyrEnv }
  { name: 'ALYR_JOBS_INLINE', value: 'false' }
  { name: 'ALYR_PUBLIC_WEB_URL', value: webUrl }
  { name: 'ALYR_DATABASE_URL', secretRef: 'database-url' }
  { name: 'ALYR_MIGRATION_URL', secretRef: 'migration-url' }
  { name: 'ALYR_BACKUP_URL', secretRef: 'backup-url' }
  { name: 'ALYR_META_APP_SECRET', secretRef: 'meta-app-secret' }
  { name: 'ALYR_META_VERIFY_TOKEN', secretRef: 'meta-verify-token' }
  { name: 'ALYR_META_ACCESS_TOKEN', secretRef: 'meta-access-token' }
  { name: 'ALYR_META_PHONE_NUMBER_ID', secretRef: 'meta-phone-number-id' }
  { name: 'ALYR_META_WABA_ID', secretRef: 'meta-waba-id' }
  { name: 'ALYR_EMAIL_API_KEY', secretRef: 'email-api-key' }
  { name: 'ALYR_LINK_SECRET', secretRef: 'link-secret' }
  { name: 'ALYR_R2_ACCOUNT_ID', secretRef: 'r2-account-id' }
  { name: 'ALYR_R2_ACCESS_KEY_ID', secretRef: 'r2-access-key-id' }
  { name: 'ALYR_R2_SECRET_ACCESS_KEY', secretRef: 'r2-secret-access-key' }
  { name: 'ALYR_R2_BUCKET', value: mediaBucket }
  { name: 'ALYR_MEDIA_BASE_URL', value: mediaBaseUrl }
]
var registries = [ { server: registry.properties.loginServer, identity: appsIdentity.id } ]
var identity = {
  type: 'UserAssigned'
  userAssignedIdentities: { '${appsIdentity.id}': {} }
}

resource api 'Microsoft.App/containerApps@2025-01-01' = if (deployApps) {
  name: names.api
  location: location
  tags: tags
  identity: identity
  properties: {
    environmentId: appsEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      registries: registries
      secrets: apiSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: image.api
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: apiEnv
          probes: [
            { type: 'Liveness', httpGet: { path: '/health', port: 8000 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/health/ready', port: 8000 }, periodSeconds: 10 }
          ]
        }
      ]
      // Always one running: Meta's webhooks must never wait for a cold start.
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [ { name: 'http', http: { metadata: { concurrentRequests: '50' } } } ]
      }
    }
  }
  dependsOn: [ appsReadSecrets, appsPullImages ]
}

resource worker 'Microsoft.App/containerApps@2025-01-01' = if (deployApps) {
  name: names.worker
  location: location
  tags: tags
  identity: identity
  properties: {
    environmentId: appsEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      registries: registries
      secrets: apiSecrets
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: image.api
          command: [ 'python', '-m', 'alyr.worker' ]
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: apiEnv
        }
      ]
      // One worker. The job queue lets several share work safely when one is not enough.
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
  dependsOn: [ appsReadSecrets, appsPullImages ]
}

resource web 'Microsoft.App/containerApps@2025-01-01' = if (deployApps) {
  name: names.web
  location: location
  tags: tags
  identity: identity
  properties: {
    environmentId: appsEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'web'
          image: image.web
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          // The order page asks the API from the server while it runs (its link preview and
          // first items), so the running server needs the API's address, not only the build.
          env: [ { name: 'ALYR_API_URL', value: 'https://${names.api}.${appsEnv.properties.defaultDomain}' } ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/login', port: 3000 }, periodSeconds: 30 }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [ { name: 'http', http: { metadata: { concurrentRequests: '50' } } } ]
      }
    }
  }
  dependsOn: [ appsPullImages ]
}

// Run once per deploy, before the new API starts (the deploy workflow starts it).
resource migrateJob 'Microsoft.App/jobs@2025-01-01' = if (deployApps) {
  name: names.migrateJob
  location: location
  tags: tags
  identity: identity
  properties: {
    environmentId: appsEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: registries
      secrets: apiSecrets
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: image.api
          command: [ 'python', '-m', 'alyr.migrate' ]
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: apiEnv
        }
      ]
    }
  }
  dependsOn: [ appsReadSecrets, appsPullImages ]
}

var backupSecretNames = [
  'backup-url'
  'backup-age-recipient'
  'backup-gcs-access-key-id'
  'backup-gcs-secret-access-key'
  'backup-r2-endpoint'
  'backup-r2-access-key-id'
  'backup-r2-secret-access-key'
]

// Nightly at 23:00 UTC, 02:00 in Doha. A failed run is visible in the job's history.
resource backupJob 'Microsoft.App/jobs@2025-01-01' = if (deployApps && deployBackupJob) {
  name: names.backupJob
  location: location
  tags: tags
  identity: identity
  properties: {
    environmentId: appsEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      scheduleTriggerConfig: { cronExpression: '0 23 * * *', parallelism: 1, replicaCompletionCount: 1 }
      registries: registries
      secrets: [for s in backupSecretNames: {
        name: s
        keyVaultUrl: '${vaultSecret}${s}'
        identity: appsIdentity.id
      }]
    }
    template: {
      containers: [
        {
          name: 'backup'
          image: image.backup
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'BACKUP_DATABASE_URL', secretRef: 'backup-url' }
            { name: 'BACKUP_AGE_RECIPIENT', secretRef: 'backup-age-recipient' }
            { name: 'BACKUP_DESTINATIONS', value: backupDestinations }
            { name: 'BACKUP_KEEP_DAYS', value: '35' }
            { name: 'RCLONE_CONFIG_GCS_TYPE', value: 's3' }
            { name: 'RCLONE_CONFIG_GCS_PROVIDER', value: 'GCS' }
            { name: 'RCLONE_CONFIG_GCS_ENDPOINT', value: 'https://storage.googleapis.com' }
            { name: 'RCLONE_CONFIG_GCS_ACCESS_KEY_ID', secretRef: 'backup-gcs-access-key-id' }
            { name: 'RCLONE_CONFIG_GCS_SECRET_ACCESS_KEY', secretRef: 'backup-gcs-secret-access-key' }
            { name: 'RCLONE_CONFIG_R2_TYPE', value: 's3' }
            { name: 'RCLONE_CONFIG_R2_PROVIDER', value: 'Cloudflare' }
            { name: 'RCLONE_CONFIG_R2_ENDPOINT', secretRef: 'backup-r2-endpoint' }
            { name: 'RCLONE_CONFIG_R2_ACCESS_KEY_ID', secretRef: 'backup-r2-access-key-id' }
            { name: 'RCLONE_CONFIG_R2_SECRET_ACCESS_KEY', secretRef: 'backup-r2-secret-access-key' }
          ]
        }
      ]
    }
  }
  dependsOn: [ appsReadSecrets, appsPullImages ]
}

// ---------------------------------------------------------------- spending alert

resource budget 'Microsoft.Consumption/budgets@2026-06-01' = {
  name: '${prefix}-monthly'
  properties: {
    category: 'Cost'
    amount: monthlyBudget
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
    notifications: {
      spent80: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: [ alertEmail ]
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: [ alertEmail ]
      }
    }
  }
}

// ---------------------------------------------------------------- outputs (no secrets)

output registryLoginServer string = registry.properties.loginServer
output registryName string = registry.name
output keyVaultName string = keyVault.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output environmentDomain string = appsEnv.properties.defaultDomain
output apiUrl string = 'https://${names.api}.${appsEnv.properties.defaultDomain}'
output webUrl string = webUrl
output deployClientId string = deployIdentity.properties.clientId
output tenantId string = subscription().tenantId
output subscriptionId string = subscription().subscriptionId
output resourceGroupName string = resourceGroup().name
