{
  description = "pi-decompression extension development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            funzzy
            git
            gnumake
            just
            nodejs_22
            ripgrep
          ];

          shellHook = ''
            echo "pi-decompression dev shell ready"
            echo "run: make help"
          '';
        };
      });
}
