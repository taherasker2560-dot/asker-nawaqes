plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.askerpharmacy.adam"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.askerpharmacy.adam"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        // the owner's phone (Galaxy A56) is 64-bit ARM: the smaller APK
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    // a stable signing key (made once and kept in the build's cache) so a new build updates the old one in place;
    // without it (a local build) the normal debug key is used
    val ks = System.getenv("ADAM_KEYSTORE")
    if (ks != null) {
        signingConfigs {
            create("adam") {
                storeFile = file(ks)
                storePassword = System.getenv("ADAM_KS_PASS")
                keyAlias = "adam"
                keyPassword = System.getenv("ADAM_KS_PASS")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            if (ks != null) signingConfig = signingConfigs.getByName("adam")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    // the speech model is a zip kept as it is in the assets (the app unpacks it once)
    androidResources {
        noCompress += listOf("zip")
    }
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
    lint {
        abortOnError = false
    }
}

dependencies {
    implementation("com.alphacephei:vosk-android:0.3.47")
    implementation("net.java.dev.jna:jna:5.13.0@aar")
}
