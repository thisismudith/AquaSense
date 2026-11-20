/**
 * Config plugin: release signing from a properties file kept OUTSIDE the repository.
 *
 * Looks for (first match):
 *   1. env SIPSURE_KEYSTORE_PROPERTIES = path to a .properties file
 *   2. ~/.sipsure/keystore.properties
 *   3. env AQUASENSE_KEYSTORE_PROPERTIES, then ~/.aquasense/keystore.properties (pre-rename locations, still honoured)
 * The file must define: storeFile, storePassword, keyAlias, keyPassword.
 * If none is found, the release build falls back to the debug key and Gradle prints a warning —
 * such an APK must not be distributed.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// sipsure-release-signing';

const SNIPPET = `
${MARKER}
def sipsureHome = System.getProperty("user.home")
def sipsureKeystorePropsFile = [
    System.getenv("SIPSURE_KEYSTORE_PROPERTIES"),
    "\${sipsureHome}/.sipsure/keystore.properties",
    System.getenv("AQUASENSE_KEYSTORE_PROPERTIES"),
    "\${sipsureHome}/.aquasense/keystore.properties",
].findAll { it }.collect { file(it) }.find { it.exists() } ?: file("\${sipsureHome}/.sipsure/keystore.properties")
def sipsureKeystoreProps = new Properties()
def sipsureHasReleaseKey = sipsureKeystorePropsFile.exists()
if (sipsureHasReleaseKey) {
    sipsureKeystorePropsFile.withInputStream { sipsureKeystoreProps.load(it) }
} else {
    logger.warn("SipSure: no release keystore properties found; release APK will be signed with the DEBUG key (not for distribution).")
}
android {
    signingConfigs {
        if (sipsureHasReleaseKey) {
            sipsureRelease {
                storeFile file(sipsureKeystoreProps["storeFile"])
                storePassword sipsureKeystoreProps["storePassword"]
                keyAlias sipsureKeystoreProps["keyAlias"]
                keyPassword sipsureKeystoreProps["keyPassword"]
            }
        }
    }
    buildTypes {
        release {
            if (sipsureHasReleaseKey) {
                signingConfig signingConfigs.sipsureRelease
            }
        }
    }
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) cfg.modResults.contents += `\n${SNIPPET}`;
    return cfg;
  });
};
