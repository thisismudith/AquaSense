/**
 * Config plugin: release signing from a properties file kept OUTSIDE the repository.
 *
 * Looks for (first match):
 *   1. env AQUASENSE_KEYSTORE_PROPERTIES = path to a .properties file
 *   2. ~/.aquasense/keystore.properties
 * The file must define: storeFile, storePassword, keyAlias, keyPassword.
 * If none is found, the release build falls back to the debug key and Gradle prints a warning —
 * such an APK must not be distributed.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// aquasense-release-signing';

const SNIPPET = `
${MARKER}
def aquasenseKeystorePropsFile = System.getenv("AQUASENSE_KEYSTORE_PROPERTIES") ? file(System.getenv("AQUASENSE_KEYSTORE_PROPERTIES")) : file("\${System.getProperty("user.home")}/.aquasense/keystore.properties")
def aquasenseKeystoreProps = new Properties()
def aquasenseHasReleaseKey = aquasenseKeystorePropsFile.exists()
if (aquasenseHasReleaseKey) {
    aquasenseKeystorePropsFile.withInputStream { aquasenseKeystoreProps.load(it) }
} else {
    logger.warn("AquaSense: no release keystore properties found; release APK will be signed with the DEBUG key (not for distribution).")
}
android {
    signingConfigs {
        if (aquasenseHasReleaseKey) {
            aquasenseRelease {
                storeFile file(aquasenseKeystoreProps["storeFile"])
                storePassword aquasenseKeystoreProps["storePassword"]
                keyAlias aquasenseKeystoreProps["keyAlias"]
                keyPassword aquasenseKeystoreProps["keyPassword"]
            }
        }
    }
    buildTypes {
        release {
            if (aquasenseHasReleaseKey) {
                signingConfig signingConfigs.aquasenseRelease
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
