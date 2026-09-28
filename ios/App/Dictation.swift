import AVFoundation
import Speech

/// Hold-to-talk transcription, entirely on the iPhone (iOS 26 SpeechAnalyzer). The audio is never
/// stored or sent anywhere; only the text the user then chooses to save goes to Cadence.
@MainActor @Observable
final class Dictation {
    var text = ""
    var listening = false
    var unavailable: String?

    private var engine: AVAudioEngine?
    private var analyzer: SpeechAnalyzer?
    private var input: AsyncStream<AnalyzerInput>.Continuation?
    private var results: Task<Void, Never>?
    private var finalized = ""

    static var supported: Bool { SpeechTranscriber.isAvailable }

    func start() async {
        guard !listening else { return }
        guard await AVAudioApplication.requestRecordPermission() else { unavailable = "Microphone access is off. Turn it on in Settings to talk your check-in."; return }
        do {
            let transcriber = SpeechTranscriber(locale: Locale.current, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
            if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) { try await install.downloadAndInstall() }
            let analyzer = SpeechAnalyzer(modules: [transcriber])
            guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else { unavailable = "Speech isn't available on this device."; return }
            let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
            input = cont
            self.analyzer = analyzer
            finalized = text.isEmpty ? "" : text + " "
            results = Task { [weak self] in
                do {
                    for try await r in transcriber.results {
                        let piece = String(r.text.characters)
                        await MainActor.run {
                            guard let self else { return }
                            if r.isFinal { self.finalized += piece; self.text = self.finalized } else { self.text = self.finalized + piece }
                        }
                    }
                } catch {}
            }
            try await analyzer.start(inputSequence: stream)

            try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement)
            try AVAudioSession.sharedInstance().setActive(true)
            let engine = AVAudioEngine()
            let mic = engine.inputNode.outputFormat(forBus: 0)
            let converter = AVAudioConverter(from: mic, to: format)
            engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: mic) { buffer, _ in
                guard let converter else { return }
                let ratio = format.sampleRate / mic.sampleRate
                guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1) else { return }
                var fed = false
                _ = converter.convert(to: out, error: nil) { _, status in
                    if fed { status.pointee = .noDataNow; return nil }
                    fed = true; status.pointee = .haveData; return buffer
                }
                cont.yield(AnalyzerInput(buffer: out))
            }
            try engine.start()
            self.engine = engine
            listening = true
        } catch {
            unavailable = "Couldn't start listening: \(error.localizedDescription)"
        }
    }

    func stop() async {
        guard listening else { return }
        listening = false
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        input?.finish()
        try? await analyzer?.finalizeAndFinishThroughEndOfInput()
        analyzer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
