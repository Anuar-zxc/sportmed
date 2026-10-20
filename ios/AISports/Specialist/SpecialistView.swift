// Режим специалиста: полный кабинет (local-first, работает офлайн благодаря service worker) внутри приложения,
// плюс нативный приём ссылок-ответов спортсменов из буфера обмена и через «Поделиться».
import SwiftUI
import WebKit
import Combine

struct SpecialistView: View {
    @EnvironmentObject var state: AppState
    @StateObject private var web = CabinetController()
    @State private var showInbox = false

    var body: some View {
        NavigationStack {
            CabinetWebView(controller: web)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Кабинет")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { web.goBack() } label: { Image(systemName: "chevron.left") }.disabled(!web.canGoBack)
                    }
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button { showInbox = true } label: { Image(systemName: "tray.and.arrow.down") }.accessibilityLabel("Входящие чек-ины")
                        Menu {
                            Button("Обновить") { web.reload() }
                            Button("На главную кабинета") { web.load(path: "/app#/overview") }
                            Button("Сменить роль") { state.role = nil }
                        } label: { Image(systemName: "ellipsis.circle") }
                    }
                }
                .overlay(alignment: .top) {
                    if web.offline {
                        Label("Нет сети — кабинет работает с данными на этом устройстве", systemImage: "wifi.slash")
                            .font(.caption).padding(8).frame(maxWidth: .infinity).background(Theme.panel2)
                    }
                }
                .sheet(isPresented: $showInbox) { InboxView { text in web.acceptReplies(text) } }
                .onChange(of: state.pendingReplyURL) { _, v in
                    if let v { web.acceptReplies(v); state.pendingReplyURL = nil }
                }
                .onAppear { if let v = state.pendingReplyURL { web.acceptReplies(v); state.pendingReplyURL = nil } }
        }
    }
}

/// Вставка ссылок-ответов: сколько найдено — столько и примет кабинет (дубликаты и подделки он отклонит сам).
struct InboxView: View {
    @Environment(\.dismiss) private var dismiss
    let onAccept: (String) -> Void
    @State private var text = ""

    private var found: Int { ASPCrypto.parseReplies(text).count }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("Вставьте переписку со спортсменами целиком — приложение само найдёт все ссылки-ответы вида app#ci=…")
                    .foregroundStyle(Theme.muted)
                TextEditor(text: $text).font(.system(.footnote, design: .monospaced)).frame(minHeight: 180)
                    .padding(8).background(Theme.panel, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line, lineWidth: 1))
                HStack(spacing: 10) {
                    Button("Из буфера") { text = UIPasteboard.general.string ?? "" }.buttonStyle(GhostButtonStyle())
                    Button(found == 0 ? "Ссылок не найдено" : "Принять: \(found)") { onAccept(text); dismiss() }.buttonStyle(PrimaryButtonStyle()).disabled(found == 0)
                }
                Spacer()
            }
            .padding(20)
            .background(Theme.bg)
            .navigationTitle("Входящие чек-ины")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Закрыть") { dismiss() } } }
        }
    }
}

// MARK: - WKWebView

@MainActor
final class CabinetController: NSObject, ObservableObject {
    @Published var canGoBack = false
    @Published var offline = false
    private(set) var webView: WKWebView?

    func attach(_ wv: WKWebView) {
        webView = wv
        wv.navigationDelegate = self
        wv.uiDelegate = self
        load(path: "/app")
    }

    func load(path: String) {
        guard let wv = webView, let url = URL(string: path, relativeTo: AppState.siteBase) else { return }
        wv.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 20))
    }

    func reload() { webView?.reload() }
    func goBack() { webView?.goBack() }

    /// Передаёт текст со ссылками-ответами во «Входящие» кабинета: открывает окно и подставляет текст.
    func acceptReplies(_ text: String) {
        guard let wv = webView else { return }
        let js = """
        (function(t){
          var btn = document.querySelector('[data-action="inbox"]');
          if (!btn) { location.hash = '#/overview'; btn = document.querySelector('[data-action="inbox"]'); }
          if (btn) { btn.click(); }
          setTimeout(function(){ var ta = document.getElementById('ib-text'); if (ta) { ta.value = t; ta.dispatchEvent(new Event('input', {bubbles:true})); } }, 250);
          return !!btn;
        })(\(jsString(text)));
        """
        wv.evaluateJavaScript(js) { ok, _ in
            if (ok as? Bool) != true, let one = ASPCrypto.parseReply(text) {
                // кабинет в демо-режиме: откроем первую ссылку напрямую — страница сама предложит переключиться на пилот
                self.load(path: "/app#ci=\(one.teamId).\(one.athleteId).\(one.blob)")
            }
        }
    }

    private func jsString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        let arr = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(arr.dropFirst().dropLast())
    }
}

extension CabinetController: WKNavigationDelegate, WKUIDelegate {
    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in canGoBack = webView.canGoBack; offline = false }
    }
    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in offline = (error as NSError).code == NSURLErrorNotConnectedToInternet }
    }
    nonisolated func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.allow); return }
        // внешние ссылки (Telegram, почта, GitHub) — в систему; сайт — внутри
        if let host = url.host, host != AppState.siteBase.host, action.navigationType == .linkActivated || url.scheme != "https" {
            Task { @MainActor in UIApplication.shared.open(url) }
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    nonisolated func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { Task { @MainActor in UIApplication.shared.open(url) } }
        return nil
    }
    nonisolated func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        Task { @MainActor in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "ОК", style: .default) { _ in completionHandler() })
            Self.topVC()?.present(a, animated: true)
        }
    }
    nonisolated func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        Task { @MainActor in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(false) })
            a.addAction(UIAlertAction(title: "ОК", style: .default) { _ in completionHandler(true) })
            Self.topVC()?.present(a, animated: true)
        }
    }
    nonisolated func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        Task { @MainActor in
            let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            a.addTextField { $0.text = defaultText }
            a.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(nil) })
            a.addAction(UIAlertAction(title: "ОК", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
            Self.topVC()?.present(a, animated: true)
        }
    }

    @MainActor static func topVC() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var vc = scene?.keyWindow?.rootViewController
        while let p = vc?.presentedViewController { vc = p }
        return vc
    }
}

struct CabinetWebView: UIViewRepresentable {
    let controller: CabinetController

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.limitsNavigationsToAppBoundDomains = true          // включает service worker и офлайн внутри приложения
        cfg.allowsInlineMediaPlayback = true
        cfg.websiteDataStore = .default()
        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.allowsBackForwardNavigationGestures = true
        wv.scrollView.contentInsetAdjustmentBehavior = .automatic
        wv.isOpaque = false
        wv.backgroundColor = UIColor(Theme.bg)
        controller.attach(wv)
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
