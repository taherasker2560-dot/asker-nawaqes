plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.askerpharmacy.contacts"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.askerpharmacy.contacts"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    // one signing key for every build (made once and kept in the build's cache), so a new build updates the old one in place;
    // without it (a local build) the release is unsigned and the debug build uses the normal debug key
    val ks = System.getenv("CONTACTS_KEYSTORE")
    if (ks != null) {
        signingConfigs {
            create("contacts") {
                storeFile = file(ks)
                storePassword = System.getenv("CONTACTS_KS_PASS")
                keyAlias = "contacts"
                keyPassword = System.getenv("CONTACTS_KS_PASS")
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            isDebuggable = false
            if (ks != null) signingConfig = signingConfigs.getByName("contacts")
        }
        getByName("debug") {
            if (ks != null) signingConfig = signingConfigs.getByName("contacts")
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
    // the JSON of the Android framework is only a stub on the build machine: the real one for the tests
    testImplementation("org.json:json:20240303")
}