{
  description = "Sigue el Desfile: entorno de desarrollo del backend, la infraestructura y el CI";

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
              # Terraform tiene licencia BSL (no libre). Se habilita solo ese
              # paquete, no todo lo no libre.
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

            # Secretos
            sops
            age

            # Chequeos
            pre-commit
            gitleaks
            nixfmt-rfc-style

            # Infraestructura
            terraform
            tflint

            # Web (scripts que exportan datos al backend)
            nodejs_22
          ];

          env = {
            # uv usa el Python del flake en vez de descargar uno propio.
            UV_PYTHON_DOWNLOADS = "never";
            UV_PYTHON = "${pkgs.python312}/bin/python";
          }
          # Los paquetes precompilados de PyPI (greenlet, numpy, shapely…)
          # esperan libstdc++ y zlib del sistema, y el Python de Nix no las
          # busca ahí. En macOS no hace falta.
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
