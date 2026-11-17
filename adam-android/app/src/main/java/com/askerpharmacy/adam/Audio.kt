package com.askerpharmacy.adam

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * One sentence of his voice, packed to go to the server («آدم 3»): AAC (about 4 KB a second, a tenth of plain sound, so a day of his
 * sentences stays small on the phone's data), or plain WAV when the phone cannot make AAC. Background thread only.
 */
object Audio {
    /** AAC with ADTS headers (what Gemini reads as audio/aac), or null when the phone's encoder fails. */
    fun aac(pcm: ShortArray, rate: Int = Ear.RATE): ByteArray? {
        var codec: MediaCodec? = null
        return try {
            val fmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, rate, 1)
            fmt.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            fmt.setInteger(MediaFormat.KEY_BIT_RATE, 32000)
            fmt.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
            val c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
            codec = c
            c.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            c.start()
            val raw = ByteBuffer.allocate(pcm.size * 2).order(ByteOrder.LITTLE_ENDIAN).also { it.asShortBuffer().put(pcm) }.array()
            val out = ByteArrayOutputStream(pcm.size / 4 + 1024)
            val info = MediaCodec.BufferInfo()
            var inPos = 0
            var inputDone = false
            var outputDone = false
            val until = System.currentTimeMillis() + 6000
            while (!outputDone && System.currentTimeMillis() < until) {
                if (!inputDone) {
                    val ii = c.dequeueInputBuffer(10_000)
                    if (ii >= 0) {
                        val buf = c.getInputBuffer(ii) ?: throw IllegalStateException("no input buffer")
                        buf.clear()
                        val n = minOf(buf.remaining(), raw.size - inPos)
                        val pts = (inPos / 2).toLong() * 1_000_000L / rate
                        if (n <= 0) {
                            c.queueInputBuffer(ii, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            buf.put(raw, inPos, n)
                            c.queueInputBuffer(ii, 0, n, pts, 0)
                            inPos += n
                        }
                    }
                }
                val oi = c.dequeueOutputBuffer(info, 10_000)
                if (oi >= 0) {
                    val ob = c.getOutputBuffer(oi)
                    if (ob != null && info.size > 0 && (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                        ob.position(info.offset); ob.limit(info.offset + info.size)
                        val frame = ByteArray(info.size); ob.get(frame)
                        out.write(adts(info.size + 7, rate)); out.write(frame)
                    }
                    c.releaseOutputBuffer(oi, false)
                    if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputDone = true
                }
            }
            if (outputDone && out.size() > 0) out.toByteArray() else null
        } catch (e: Throwable) {
            null
        } finally {
            try { codec?.stop() } catch (e: Throwable) { }
            try { codec?.release() } catch (e: Throwable) { }
        }
    }

    /** The 7-byte ADTS header of one AAC-LC frame of [len] bytes (header included), mono. */
    private fun adts(len: Int, rate: Int): ByteArray {
        val rates = intArrayOf(96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350)
        val freq = rates.indexOf(rate).let { if (it < 0) 8 else it }
        val profile = 2   // AAC LC
        val chan = 1
        return byteArrayOf(
            0xFF.toByte(), 0xF1.toByte(),
            (((profile - 1) shl 6) + (freq shl 2) + (chan shr 2)).toByte(),
            (((chan and 3) shl 6) + (len shr 11)).toByte(),
            ((len and 0x7FF) shr 3).toByte(),
            (((len and 7) shl 5) + 0x1F).toByte(),
            0xFC.toByte(),
        )
    }

    /** Plain 16-bit mono WAV. */
    fun wav(pcm: ShortArray, rate: Int = Ear.RATE): ByteArray {
        val data = pcm.size * 2
        val b = ByteBuffer.allocate(44 + data).order(ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray()); b.putInt(36 + data); b.put("WAVE".toByteArray())
        b.put("fmt ".toByteArray()); b.putInt(16); b.putShort(1); b.putShort(1); b.putInt(rate); b.putInt(rate * 2); b.putShort(2); b.putShort(16)
        b.put("data".toByteArray()); b.putInt(data)
        for (s in pcm) b.putShort(s)
        return b.array()
    }

    /** The samples of a 16-bit WAV file (any rate is brought to 16 kHz, first channel only); null when it is not one. For tests over adb. */
    fun readWav(bytes: ByteArray): ShortArray? {
        if (bytes.size < 44 || String(bytes, 0, 4) != "RIFF") return null
        val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        var pos = 12
        var rate = 16000; var chans = 1; var bits = 16
        while (pos + 8 <= bytes.size) {
            val id = String(bytes, pos, 4); val size = b.getInt(pos + 4)
            if (id == "fmt ") { chans = b.getShort(pos + 10).toInt(); rate = b.getInt(pos + 12); bits = b.getShort(pos + 22).toInt() }
            if (id == "data") {
                if (bits != 16) return null
                val n = minOf(size, bytes.size - pos - 8) / 2 / chans
                val src = ShortArray(n) { b.getShort(pos + 8 + it * 2 * chans) }
                if (rate == Ear.RATE) return src
                val m = (n.toLong() * Ear.RATE / rate).toInt()
                return ShortArray(m) { src[minOf(n - 1, (it.toLong() * rate / Ear.RATE).toInt())] }
            }
            pos += 8 + size + (size and 1)
        }
        return null
    }
}
