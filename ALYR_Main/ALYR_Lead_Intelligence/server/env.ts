try {
  process.loadEnvFile?.('.env');
} catch {
  // Local configuration is optional; safe defaults keep discovery and outreach disabled.
}
