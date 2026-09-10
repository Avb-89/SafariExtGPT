//
//  SafariWebExtensionHandler.swift
//  SafariExtGPT Extension
//
//  Created by SITIS on 9/4/26.
//

import SafariServices
import os.log
import CryptoKit

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let codexClientID = "app_EMoamEEZ73f0CkXaXp7hrann"
    private let codexAuthorizeURL = URL(string: "https://auth.openai.com/oauth/authorize")!
    private let codexRedirectURI = "http://localhost:1455/auth/callback"

    private let appGroupID = "group.com.sitis.SafariExtGPT"


    private func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func makeRandomURLSafeString(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess)
        return base64URLEncode(Data(bytes))
    }

    private func makeCodexAuthorization() -> [String: Any] {
        if #available(macOS 10.15, *) {
            let verifier = makeRandomURLSafeString(byteCount: 32)
            let challenge = base64URLEncode(Data(SHA256.hash(data: Data(verifier.utf8))))
            let state = makeRandomURLSafeString(byteCount: 24)

            var components = URLComponents(url: codexAuthorizeURL, resolvingAgainstBaseURL: false)!
            components.queryItems = [
                URLQueryItem(name: "response_type", value: "code"),
                URLQueryItem(name: "client_id", value: codexClientID),
                URLQueryItem(name: "redirect_uri", value: codexRedirectURI),
                URLQueryItem(name: "scope", value: "openid profile email offline_access api.connectors.read api.connectors.invoke"),
                URLQueryItem(name: "code_challenge", value: challenge),
                URLQueryItem(name: "code_challenge_method", value: "S256"),
                URLQueryItem(name: "id_token_add_organizations", value: "true"),
                URLQueryItem(name: "codex_cli_simplified_flow", value: "true"),
                URLQueryItem(name: "state", value: state),
                URLQueryItem(name: "originator", value: "safariextgpt")
            ]

            return [
                "ok": true,
                "authorizationURL": components.url!.absoluteString,
                "codeVerifier": verifier,
                "state": state,
                "redirectURI": codexRedirectURI
            ]
        }

        return [
            "ok": false,
            "error": "Codex OAuth requires macOS 10.15 or newer"
        ]
    }

    private func prepareOAuthRequestForApp() -> [String: Any] {
        let authorization = makeCodexAuthorization()

        guard authorization["ok"] as? Bool == true,
              let authorizationURL = authorization["authorizationURL"] as? String,
              let codeVerifier = authorization["codeVerifier"] as? String,
              let state = authorization["state"] as? String else {
            return authorization
        }

        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            return [
                "ok": false,
                "error": "Could not open App Group UserDefaults"
            ]
        }

        defaults.set(authorizationURL, forKey: "oauth.authorizationURL")
        defaults.set(codeVerifier, forKey: "oauth.codeVerifier")
        defaults.set(state, forKey: "oauth.state")
        defaults.set(Date().timeIntervalSince1970, forKey: "oauth.createdAt")
        defaults.removeObject(forKey: "oauth.result")

        return [
            "ok": true,
            "reply": "OAUTH_REQUEST_READY"
        ]
    }

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")

        var responseMessage: [String: Any]

        if let dictionary = message as? [String: Any],
           let type = dictionary["type"] as? String {
            switch type {
            case "PING_NATIVE":
                responseMessage = [
                    "ok": true,
                    "reply": "SAFARI_NATIVE_OK"
                ]
            case "PREPARE_CODEX_OAUTH":
                responseMessage = prepareOAuthRequestForApp()
            default:
                responseMessage = [
                    "ok": false,
                    "error": "Unknown native message"
                ]
            }
        } else {
            responseMessage = [
                "ok": false,
                "error": "Invalid native message"
            ]
        }

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: responseMessage]
        } else {
            response.userInfo = ["message": responseMessage]
        }

        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

}
