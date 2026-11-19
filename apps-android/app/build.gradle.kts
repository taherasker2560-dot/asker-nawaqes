plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.askerpharmacy.apps"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.askerpharmacy.apps"
        minSdk = 24
        targetSdk = 34
        versionCode = 2
        versionName = "1.1"
    }

    // one signing key for every build (made once and kept in the build's cache), so a new build updates the old one in place;
    // without it (a local build) the release is unsigned and the debug build uses the normal debug key
    val ks = System.getenv("APPS_KEYSTORE")
    if (ks != null) {
        signingConfigs {
            create("apps") {
                storeFile = file(ks)
                storePassword = System.getenv("APPS_KS_PASS")
                keyAlias = "apps"
                keyPassword = System.getenv("APPS_KS_PASS")
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            isDebuggable = false
            if (ks != null) signingConfig = signingConfigs.getByName("apps")
        }
        getByName("debug") {
            if (ks != null) signingConfig = signingConfigs.getByName("apps")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
    lint {
        abortOnError = false
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
