// Добавление персональной ссылки: вставить из буфера или отсканировать QR-код из кабинета специалиста.
import SwiftUI
import AVFoundation

struct InviteView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss
    let onDone: () -> Void
    @State private var text = ""
    @State private var error: String?
    @State private var scanning = false
    @State private var cameraDenied = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Специалист выдаёт каждому спортсмену персональную ссылку. В ней — ключ, которым шифруются ваши ответы. Ссылка хранится только на этом телефоне.")
                        .foregroundStyle(Theme.muted)

                    Card {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("Отсканировать QR-код", systemImage: "qrcode.viewfinder").font(.headline)
                            if scanning {
                                QRScannerView { code in handle(code) } onDenied: { cameraDenied = true; scanning = false }
                                    .frame(height: 280)
                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                Button("Остановить") { scanning = false }.buttonStyle(GhostButtonStyle())
                            } else {
                                Text("Код показан в кабинете в окне «Чек-ин с телефона».").font(.subheadline).foregroundStyle(Theme.muted)
                                Button("Открыть камеру") { scanning = true }.buttonStyle(PrimaryButtonStyle())
                                if cameraDenied { Text("Нет доступа к камере — разрешите его в Настройках iPhone или вставьте ссылку текстом.").font(.footnote).foregroundStyle(Theme.red) }
                            }
                        }
                    }

                    Card {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("Или вставьте ссылку", systemImage: "link").font(.headline)
                            TextField("https://…/checkin#v1.…", text: $text, axis: .vertical).lineLimit(2...4).textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                            HStack(spacing: 10) {
                                Button("Из буфера") { if let s = UIPasteboard.general.string { text = s; handle(s) } }.buttonStyle(GhostButtonStyle())
                                Button("Сохранить") { handle(text) }.buttonStyle(PrimaryButtonStyle())
                            }
                        }
                    }
                    if let e = error { Label(e, systemImage: "exclamationmark.triangle").font(.subheadline).foregroundStyle(Theme.red) }
                }
                .padding(20)
            }
            .background(Theme.bg)
            .navigationTitle("Ссылка на чек-ин")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Закрыть") { dismiss() } } }
        }
    }

    private func handle(_ s: String) {
        guard let inv = ASPCrypto.parseInvite(s) else { error = ASPCryptoError.badInvite.localizedDescription; return }
        state.setInvite(inv)
        scanning = false
        onDone()
        dismiss()
    }
}

/// Сканер QR на AVFoundation — без сторонних библиотек.
struct QRScannerView: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    let onDenied: () -> Void

    func makeUIViewController(context: Context) -> ScannerVC { let vc = ScannerVC(); vc.onCode = onCode; vc.onDenied = onDenied; return vc }
    func updateUIViewController(_ uiViewController: ScannerVC, context: Context) {}

    final class ScannerVC: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
        var onCode: ((String) -> Void)?
        var onDenied: (() -> Void)?
        private let session = AVCaptureSession()
        private var preview: AVCaptureVideoPreviewLayer?
        private var fired = false

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized: configure()
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { ok in DispatchQueue.main.async { ok ? self.configure() : self.onDenied?() } }
            default: onDenied?()
            }
        }

        private func configure() {
            guard let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { onDenied?(); return }
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { onDenied?(); return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            layer.frame = view.bounds
            view.layer.addSublayer(layer)
            preview = layer
            DispatchQueue.global(qos: .userInitiated).async { self.session.startRunning() }
        }

        override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
        override func viewWillDisappear(_ animated: Bool) { super.viewWillDisappear(animated); if session.isRunning { DispatchQueue.global().async { self.session.stopRunning() } } }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard !fired, let obj = objects.first as? AVMetadataMachineReadableCodeObject, let s = obj.stringValue, ASPCrypto.parseInvite(s) != nil else { return }
            fired = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onCode?(s)
        }
    }
}
