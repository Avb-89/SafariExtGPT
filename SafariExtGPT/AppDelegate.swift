//
//  AppDelegate.swift
//  SafariExtGPT
//
//  Created by SITIS on 9/4/26.
//


import Cocoa
import Network
import os.log

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    private var callbackListener: NWListener?

    private let appGroupID = "group.com.sitis.SafariExtGPT"
    private let codexClientID = "app_EMoamEEZ73f0CkXaXp7hrann"
    private let codexRedirectURI = "http://localhost:1455/auth/callback"
    private let codexTokenURL = URL(string: "https://auth.openai.com/oauth/token")!
    private let codexResponsesURL = URL(string: "https://chatgpt.com/backend-api/codex/responses")!

    private func validatedOAuthAuthorizationURL() -> URL? {
        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            os_log(.error, "Could not open SafariExtGPT App Group UserDefaults")
            return nil
        }

        guard let authorizationURL = defaults.string(forKey: "oauth.authorizationURL"),
              let codeVerifier = defaults.string(forKey: "oauth.codeVerifier"),
              let state = defaults.string(forKey: "oauth.state") else {
            os_log(.error, "SafariExtGPT OAuth request is missing from App Group")
            return nil
        }

        let createdAt = defaults.double(forKey: "oauth.createdAt")
        let age = Date().timeIntervalSince1970 - createdAt

        guard authorizationURL.hasPrefix("https://auth.openai.com/oauth/authorize?"),
              codeVerifier.count >= 43,
              !state.isEmpty,
              createdAt > 0,
              age >= 0,
              age < 600 else {
            os_log(.error, "SafariExtGPT OAuth request is invalid or stale")
            return nil
        }

        guard let url = URL(string: authorizationURL) else {
            os_log(.error, "SafariExtGPT OAuth authorization URL is malformed")
            return nil
        }

        os_log(.default, "SafariExtGPT OAuth helper accepted fresh request: verifierLength=%{public}d stateLength=%{public}d ageSeconds=%{public}.0f", codeVerifier.count, state.count, age)
        return url
    }

    private func parseOAuthCallback(from requestLine: String) -> (code: String, state: String)? {
        let parts = requestLine.split(separator: " ", maxSplits: 2).map(String.init)
        guard parts.count >= 2,
              let components = URLComponents(string: "http://localhost\(parts[1])") else {
            return nil
        }

        let values = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        guard let code = values["code"], !code.isEmpty,
              let state = values["state"], !state.isEmpty else {
            return nil
        }

        return (code, state)
    }

    private func exchangeAuthorizationCode(_ code: String, state: String, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let expectedState = defaults.string(forKey: "oauth.state"),
              let codeVerifier = defaults.string(forKey: "oauth.codeVerifier") else {
            completion(.failure(NSError(domain: "SafariExtGPT.OAuth", code: 1, userInfo: [NSLocalizedDescriptionKey: "OAuth request state is missing"])))
            return
        }

        guard state == expectedState else {
            completion(.failure(NSError(domain: "SafariExtGPT.OAuth", code: 2, userInfo: [NSLocalizedDescriptionKey: "OAuth state mismatch"])))
            return
        }

        var request = URLRequest(url: codexTokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "client_id", value: codexClientID),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "redirect_uri", value: codexRedirectURI),
            URLQueryItem(name: "code_verifier", value: codeVerifier)
        ]
        request.httpBody = form.percentEncodedQuery?.data(using: .utf8)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse,
                  let data else {
                completion(.failure(NSError(domain: "SafariExtGPT.OAuth", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid token response"])))
                return
            }

            guard (200...299).contains(http.statusCode) else {
                let message = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
                completion(.failure(NSError(domain: "SafariExtGPT.OAuth", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: message])))
                return
            }

            do {
                guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let accessToken = json["access_token"] as? String,
                      !accessToken.isEmpty else {
                    throw NSError(domain: "SafariExtGPT.OAuth", code: 4, userInfo: [NSLocalizedDescriptionKey: "Token response has no access_token"])
                }

                defaults.set(accessToken, forKey: "oauth.accessToken")
                if let idToken = json["id_token"] as? String, !idToken.isEmpty {
                    defaults.set(idToken, forKey: "oauth.idToken")
                }
                if let refreshToken = json["refresh_token"] as? String, !refreshToken.isEmpty {
                    defaults.set(refreshToken, forKey: "oauth.refreshToken")
                }
                if let expiresIn = json["expires_in"] as? Double {
                    defaults.set(Date().timeIntervalSince1970 + expiresIn, forKey: "oauth.expiresAt")
                } else if let expiresIn = json["expires_in"] as? Int {
                    defaults.set(Date().timeIntervalSince1970 + Double(expiresIn), forKey: "oauth.expiresAt")
                }
                defaults.set("success", forKey: "oauth.result")
                defaults.removeObject(forKey: "oauth.codeVerifier")
                defaults.removeObject(forKey: "oauth.state")

                completion(.success(()))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    private func chatGPTAccountID(from token: String) -> String? {
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return nil }

        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 {
            payload.append("=")
        }

        guard let data = Data(base64Encoded: payload),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        if let auth = json["https://api.openai.com/auth"] as? [String: Any],
           let accountID = auth["chatgpt_account_id"] as? String,
           !accountID.isEmpty {
            return accountID
        }

        if let accountID = json["https://api.openai.com/auth.chatgpt_account_id"] as? String,
           !accountID.isEmpty {
            return accountID
        }

        if let accountID = json["chatgpt_account_id"] as? String,
           !accountID.isEmpty {
            return accountID
        }

        return nil
    }

    private func runCodexSmokeTest(completion: @escaping (Result<String, Error>) -> Void) {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let accessToken = defaults.string(forKey: "oauth.accessToken"),
              !accessToken.isEmpty else {
            completion(.failure(NSError(domain: "SafariExtGPT.Codex", code: 10, userInfo: [NSLocalizedDescriptionKey: "OAuth access token is missing"])))
            return
        }

        let idToken = defaults.string(forKey: "oauth.idToken")
        guard let accountID = chatGPTAccountID(from: accessToken) ?? idToken.flatMap({ chatGPTAccountID(from: $0) }) else {
            completion(.failure(NSError(domain: "SafariExtGPT.Codex", code: 11, userInfo: [NSLocalizedDescriptionKey: "ChatGPT account ID is missing from OAuth tokens"])))
            return
        }

        var request = URLRequest(url: codexResponsesURL)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(accountID, forHTTPHeaderField: "ChatGPT-Account-ID")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("responses=experimental", forHTTPHeaderField: "OpenAI-Beta")
        request.setValue("safariextgpt", forHTTPHeaderField: "originator")

        let body: [String: Any] = [
            "model": "gpt-5.6-sol",
            "instructions": "Reply with exactly SAFARI_CODEX_OK and nothing else.",
            "input": [[
                "role": "user",
                "content": [[
                    "type": "input_text",
                    "text": "Return the required test string now."
                ]]
            ]],
            "tools": [],
            "tool_choice": "auto",
            "parallel_tool_calls": false,
            "store": false,
            "stream": true,
            "include": ["reasoning.encrypted_content"]
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            completion(.failure(error))
            return
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let http = response as? HTTPURLResponse,
                  let data else {
                completion(.failure(NSError(domain: "SafariExtGPT.Codex", code: 12, userInfo: [NSLocalizedDescriptionKey: "Invalid Codex response"])))
                return
            }

            let text = String(data: data, encoding: .utf8) ?? ""
            guard (200...299).contains(http.statusCode) else {
                completion(.failure(NSError(domain: "SafariExtGPT.Codex", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "Codex HTTP \(http.statusCode): \(text.prefix(1000))"])))
                return
            }

            if text.contains("SAFARI_CODEX_OK") {
                completion(.success("SAFARI_CODEX_OK"))
            } else {
                completion(.failure(NSError(domain: "SafariExtGPT.Codex", code: 13, userInfo: [NSLocalizedDescriptionKey: "Codex stream completed without SAFARI_CODEX_OK: \(text.prefix(1000))"])))
            }
        }.resume()
    }

    private var isOAuthHelperLaunch: Bool {
        ProcessInfo.processInfo.arguments.contains("--oauth-helper")
    }

    private var isCodexSmokeTestLaunch: Bool {
        ProcessInfo.processInfo.arguments.contains("--codex-smoke-test")
    }

    private func startOAuthCallbackListener(authorizationURL: URL) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 1455)

            let listener = try NWListener(using: parameters)
            callbackListener = listener

            listener.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    os_log(.default, "SafariExtGPT OAuth callback listener ready on 127.0.0.1:1455")
                    DispatchQueue.main.async {
                        NSWorkspace.shared.open(authorizationURL)
                    }
                case .failed(let error):
                    os_log(.error, "SafariExtGPT OAuth callback listener failed: %@", String(describing: error))
                    NSApp.terminate(nil)
                default:
                    break
                }
            }

            listener.newConnectionHandler = { [weak self] connection in
                connection.start(queue: .main)
                connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { data, _, _, _ in
                    let requestText = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                    let requestLine = requestText.components(separatedBy: "\r\n").first ?? ""

                    guard let callback = self?.parseOAuthCallback(from: requestLine) else {
                        let body = "SafariExtGPT OAuth callback is invalid."
                        let response = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
                        connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in
                            connection.cancel()
                        })
                        return
                    }

                    self?.exchangeAuthorizationCode(callback.code, state: callback.state) { result in
                        DispatchQueue.main.async {
                            let body: String
                            let statusLine: String

                            switch result {
                            case .success:
                                body = "SafariExtGPT connected to ChatGPT successfully. You can close this tab."
                                statusLine = "HTTP/1.1 200 OK"
                                os_log(.default, "SafariExtGPT OAuth token exchange succeeded")
                            case .failure(let error):
                                body = "SafariExtGPT could not complete ChatGPT sign-in. Check the Xcode console."
                                statusLine = "HTTP/1.1 500 Internal Server Error"
                                os_log(.error, "SafariExtGPT OAuth token exchange failed: %@", error.localizedDescription)
                            }

                            let response = "\(statusLine)\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
                            connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in
                                connection.cancel()
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                                    self?.callbackListener?.cancel()
                                    self?.callbackListener = nil
                                    NSApp.terminate(nil)
                                }
                            })
                        }
                    }
                }
            }

            listener.start(queue: .main)
        } catch {
            os_log(.error, "Could not create SafariExtGPT OAuth callback listener: %@", String(describing: error))
            NSApp.terminate(nil)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if isCodexSmokeTestLaunch {
            NSApp.setActivationPolicy(.accessory)
            NSApp.windows.forEach { $0.orderOut(nil) }
            os_log(.default, "SafariExtGPT Codex smoke test started")
            runCodexSmokeTest { result in
                DispatchQueue.main.async {
                    switch result {
                    case .success(let reply):
                        os_log(.default, "SafariExtGPT Codex smoke test succeeded: %{public}@", reply)
                    case .failure(let error):
                        os_log(.error, "SafariExtGPT Codex smoke test failed: %{public}@", error.localizedDescription)
                    }
                    NSApp.terminate(nil)
                }
            }
            return
        }

        if isOAuthHelperLaunch {
            NSApp.setActivationPolicy(.accessory)
            NSApp.windows.forEach { $0.orderOut(nil) }
            guard let authorizationURL = validatedOAuthAuthorizationURL() else {
                NSApp.terminate(nil)
                return
            }
            startOAuthCallbackListener(authorizationURL: authorizationURL)
            return
        }

        NSApp.setActivationPolicy(.regular)
        NSApp.windows.forEach { $0.makeKeyAndOrderFront(nil) }
        NSApp.activate(ignoringOtherApps: true)
    }

}
