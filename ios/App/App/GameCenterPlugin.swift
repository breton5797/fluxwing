import Capacitor
import GameKit

// Game Center for the page (window.Capacitor.Plugins.GameCenter): sign in once at start-up, submit a finished run's score to a
// leaderboard (ids in index.html, native block: NAT_GC; the boards are created in App Store Connect), and open the Game Center board.
// Every call resolves; a player who is not signed in just gets submitted: false.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise)
    ]

    @objc func signIn(_ call: CAPPluginCall) {
        let player = GKLocalPlayer.local
        if player.isAuthenticated {
            call.resolve(["authenticated": true])
            return
        }
        var answered = false
        player.authenticateHandler = { [weak self] viewController, error in
            if let viewController = viewController {
                DispatchQueue.main.async { self?.bridge?.viewController?.present(viewController, animated: true) }
                return
            }
            if answered { return }
            answered = true
            call.resolve(["authenticated": player.isAuthenticated, "error": error?.localizedDescription ?? ""])
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId"), !id.isEmpty, let score = call.getInt("score"), score >= 0 else {
            call.reject("leaderboardId and a score of 0 or more are required")
            return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.resolve(["submitted": false])
            return
        }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            call.resolve(["submitted": error == nil, "error": error?.localizedDescription ?? ""])
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        let id = call.getString("leaderboardId")
        DispatchQueue.main.async {
            let board: GKGameCenterViewController
            if let id = id, !id.isEmpty {
                board = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            } else {
                board = GKGameCenterViewController(state: .leaderboards)
            }
            board.gameCenterDelegate = self
            self.bridge?.viewController?.present(board, animated: true)
            call.resolve()
        }
    }
}

extension GameCenterPlugin: GKGameCenterControllerDelegate {
    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
