package com.askerpharmacy.adam

/**
 * Text made ready to be SPOKEN in Egyptian Arabic, before it reaches the voice (owner 2026-11-15: «لكنتها ما زالت بتتغير، مش ثابته
 * على نمط واحد … نيزناكس 50 ملغ»): the voice read «مجم» as «ملغ» and «٥٠٠» as «خمسمائة» (formal Arabic) and jumped back to
 * Egyptian after. Numbers become Egyptian words (خمسمية، مية وخمسة وعشرين، تلات تلاف) and the pharmacy's units their spoken
 * names (مجم → مللي، جم → جرام، ٪ → في المية). Used by the voice engine «آدم» and Adam's own voice.
 */
object Egyptian {
    private val ONES = arrayOf("صفر", "واحد", "اتنين", "تلاتة", "أربعة", "خمسة", "ستة", "سبعة", "تمانية", "تسعة")
    private val TEENS = arrayOf("عشرة", "حداشر", "اتناشر", "تلاتاشر", "أربعتاشر", "خمستاشر", "ستاشر", "سبعتاشر", "تمنتاشر", "تسعتاشر")
    private val TENS = arrayOf("", "", "عشرين", "تلاتين", "أربعين", "خمسين", "ستين", "سبعين", "تمانين", "تسعين")
    private val HUNDREDS = arrayOf("", "مية", "ميتين", "تلتمية", "ربعمية", "خمسمية", "ستمية", "سبعمية", "تمنمية", "تسعمية")
    private val THOUSANDS_SHORT = arrayOf("", "", "", "تلات", "أربع", "خمس", "ست", "سبع", "تمن", "تسع", "عشر")

    /** 0..999999 in Egyptian words. */
    fun words(n: Long): String {
        if (n < 0) return "سالب " + words(-n)
        if (n < 10) return ONES[n.toInt()]
        if (n < 20) return TEENS[(n - 10).toInt()]
        if (n < 100) { val o = (n % 10).toInt(); val t = TENS[(n / 10).toInt()]; return if (o == 0) t else ONES[o] + " و" + t }
        if (n < 1000) { val h = HUNDREDS[(n / 100).toInt()]; val r = n % 100; return if (r == 0L) h else h + " و" + words(r) }
        if (n < 1_000_000) {
            val k = n / 1000; val r = n % 1000
            val head = when {
                k == 1L -> "ألف"
                k == 2L -> "ألفين"
                k in 3..10 -> THOUSANDS_SHORT[k.toInt()] + " تلاف"
                else -> words(k) + " ألف"
            }
            return if (r == 0L) head else head + " و" + words(r)
        }
        return n.toString()
    }

    /** «1.5» → «واحد ونص», «0.25» → «ربع», «2.75» → «اتنين وتلت تربع», other fractions digit by digit. */
    private fun number(s: String): String {
        val dot = s.indexOf('.')
        if (dot < 0) return s.toLongOrNull()?.let { if (it <= 999_999) words(it) else null } ?: s
        val whole = s.substring(0, dot).ifEmpty { "0" }.toLongOrNull() ?: return s
        val frac = s.substring(dot + 1).trimEnd('0')
        val w = if (whole == 0L) "" else words(whole)
        val part = when (frac) {
            "" -> return words(whole)
            "5" -> "نص"
            "25" -> "ربع"
            "75" -> "تلت تربع"
            else -> null
        }
        if (part != null) return if (w.isEmpty()) part else "$w و$part"
        return (if (w.isEmpty()) "صفر" else w) + " فاصلة " + frac.map { ONES[it - '0'] }.joinToString(" ")
    }

    private val ARABIC_DIGITS = Regex("[٠-٩۰-۹]")
    private val UNITS = listOf(
        Regex("(?i)(\\d+(?:\\.\\d+)?)\\s*(مجم|ملجم|ملغ|mg)(?![\\p{L}])") to "مللي",
        Regex("(?i)(\\d+(?:\\.\\d+)?)\\s*(مل|ملل|ml|cc|سم)(?![\\p{L}])") to "مللي",
        Regex("(?i)(\\d+(?:\\.\\d+)?)\\s*(جم|جرام|gm|g)(?![\\p{L}])") to "جرام",
        Regex("(?i)(\\d+(?:\\.\\d+)?)\\s*(مكجم|mcg)(?![\\p{L}])") to "ميكرو",
        Regex("(\\d+(?:\\.\\d+)?)\\s*[٪%]") to "في المية",
    )

    fun speak(text: String): String {
        var t = ARABIC_DIGITS.replace(text) { m ->
            val c = m.value[0]
            (if (c in '٠'..'٩') c - '٠' else c - '۰').toString()
        }.replace('٫', '.')
        for ((r, unit) in UNITS) t = r.replace(t) { m -> number(m.groupValues[1]) + " " + unit }
        t = Regex("\\d+(?:\\.\\d+)?").replace(t) { m -> number(m.value) }
        return t
    }
}
