package com.askerpharmacy.adam

/**
 * No title and no name in anything Adam's voice says (owner 2026-11-15: «مش عايزه لا يناديني لا باسمي ولا باي لقب، انا عايزه يتكلم بس
 * وخلاص»). Used by the voice engine «آدم» (the bot's Tasker announcements) and by Adam's own voice, whatever text reaches them.
 */
object Titles {
    private val CALLS = listOf(
        Regex("(يا\\s*)?(باش\\s*مهندس|بشمهندس|باشمهندس)"),
        Regex("(يا\\s*)?(دكتور[هة]?|د\\.)\\s*طاهر"),
        Regex("يا\\s*دكتور[هة]?"),
        Regex("(يا\\s*)?(أستاذ|استاذ|اُستاذ)\\s*طاهر"),
        Regex("يا\\s*طاهر"),
        Regex("يا\\s*فندم"),
        Regex("حضرتك\\s*"),
    )

    fun strip(text: String): String {
        var t = text
        for (r in CALLS) t = r.replace(t, " ")
        t = t.replace(Regex("\\s+([،,.!؟?])"), "$1")          // «تمام ، كده» → «تمام، كده»
            .replace(Regex("([،,])\\s*([،,.!؟?])"), "$2")      // a comma left before another mark
            .replace(Regex("^[\\s،,.!]+"), "")                 // nothing left at the start but marks
            .replace(Regex("\\s{2,}"), " ")
        return t.trim()
    }
}
