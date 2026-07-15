group "default" {
  targets = ["deb-amd64", "deb-arm64"]
}

target "deb" {
  context    = "."
  dockerfile = "Dockerfile.release"
}

target "deb-amd64" {
  inherits  = ["deb"]
  platforms = ["linux/amd64"]
  output    = ["type=local,dest=dist/docker/amd64"]
}

target "deb-arm64" {
  inherits  = ["deb"]
  platforms = ["linux/arm64"]
  output    = ["type=local,dest=dist/docker/arm64"]
}
