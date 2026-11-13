{
  description = "Sigue el Desfile: development environment for the backend, the infrastructure and CI";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      sistemas = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      paraCadaSistema =
        f:
        nixpkgs.lib.genAttrs sistemas (
          system:
          f (
            import nixpkgs {
              inherit system;
              # Terraform is under the BSL licence (not free). Only that
              # package is allowed, not everything unfree.
              config.allowUnfreePredicate = pkg: builtins.elem (nixpkgs.lib.getName pkg) [ "terraform" ];
            }
          )
        );
    in
    {
      devShells = paraCadaSistema (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            # Backend
            python312
            uv
            postgresql_16

            # Secrets
            sops
            age

            # Checks
            pre-commit
            gitleaks
            nixfmt-rfc-style

            # Infrastructure
            terraform
            tflint

            # Web (scripts that export data to the backend)
            nodejs_22
          ];

          env = {
            # uv uses the flake's Python instead of downloading its own.
            UV_PYTHON_DOWNLOADS = "never";
            UV_PYTHON = "${pkgs.python312}/bin/python";
          }
          # Prebuilt PyPI packages (greenlet, numpy, shapely…) expect the
          # system's libstdc++ and zlib, and Nix's Python does not look for
          # them there. Not needed on macOS.
          // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
              pkgs.stdenv.cc.cc.lib
              pkgs.zlib
            ];
          };
        };
      });

      formatter = paraCadaSistema (pkgs: pkgs.nixfmt-rfc-style);
    };
}
