plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.askerpharmacy.alarm"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.askerpharmacy.alarm"
        // 27 (Android 8.1): the ring card shows over the lock screen from there
        minSdk = 27
        // 34, not 35: from 35 the system draws the page under the status and navigation bars
        targetSdk = 34
        versionCode = 3
        versionName = "1.2"
    }

    // one signing key for every build (made once and kept in the build's cache), so a new build updates the old one in place;
    // without it (a local build) the release is unsigned and the debug build uses the normal debug key
    val ks = System.getenv("ALARM_KEYSTORE")
    if (ks != null) {
        signingConfigs {
            create("alarm") {
                storeFile = file(ks)
                storePassword = System.getenv("ALARM_KS_PASS")
                keyAlias = "alarm"
                keyPassword = System.getenv("ALARM_KS_PASS")
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            isDebuggable = false
            if (ks != null) signingConfig = signingConfigs.getByName("alarm")
        }
        getByName("debug") {
            if (ks != null) signingConfig = signingConfigs.getByName("alarm")
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
