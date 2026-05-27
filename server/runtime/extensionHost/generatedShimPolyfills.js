// This file is managed by Octopus AI.
// It contains narrowly-scoped VS Code shim defaults generated from runtime failures.

module.exports = {
  "configDefaults": {
    "todo-tree": {
      "general": {
        "tags": [
          "BUG",
          "HACK",
          "FIXME",
          "TODO",
          "XXX",
          "[ ]",
          "[x]"
        ],
        "tagGroups": {},
        "statusBar": "tags"
      },
      "highlights": {
        "customHighlight": {
          "BUG": {
            "icon": "bug"
          },
          "HACK": {
            "icon": "tools"
          },
          "FIXME": {
            "icon": "flame"
          },
          "XXX": {
            "icon": "$(close)"
          }
        },
        "defaultHighlight": {},
        "enabled": true,
        "highlightDelay": 500,
        "useColourScheme": false,
        "foregroundColourScheme": [
          "white",
          "black",
          "black",
          "white",
          "white",
          "white",
          "black"
        ],
        "backgroundColourScheme": [
          "red",
          "orange",
          "yellow",
          "green",
          "blue",
          "indigo",
          "violet"
        ]
      },
      "regex": {
        "regex": "(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)",
        "regexCaseSensitive": true,
        "subTagRegex": "",
        "enableMultiLine": false
      },
      "tree": {
        "buttons": {},
        "expanded": false,
        "flat": false,
        "grouped": true,
        "groupedByTag": false,
        "groupedBySubTag": false,
        "tagsOnly": false,
        "labelFormat": "${tag} ${after}",
        "tooltipFormat": "${filepath}, line ${line}",
        "scanMode": "workspace",
        "scanAtStartup": false,
        "showBadges": true,
        "showCurrentScanMode": true,
        "showCountsInTree": false,
        "showScanModeButton": true
      },
      "filtering": {
        "excludedWorkspaces": [],
        "excludeGlobs": [
          "**/node_modules"
        ],
        "includedWorkspaces": [],
        "includeGlobs": [],
        "includeHiddenFiles": false,
        "passGlobsToRipgrep": true,
        "scopes": [],
        "useBuiltInExcludes": "none"
      },
      "ripgrep": {
        "ripgrep": "",
        "ripgrepArgs": "--max-columns=1000 --no-config ",
        "ripgrepMaxBuffer": 200,
        "usePatternFile": true
      }
    }
  },
  "apiPolyfills": {
    "window.registerWebviewViewProvider": true
  }
};
