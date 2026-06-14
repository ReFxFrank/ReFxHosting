module github.com/refxfrank/refxhosting/node-agent

go 1.22

require (
	github.com/aws/aws-sdk-go-v2 v1.30.3
	github.com/aws/aws-sdk-go-v2/config v1.27.27
	github.com/aws/aws-sdk-go-v2/credentials v1.17.27
	github.com/aws/aws-sdk-go-v2/feature/s3/manager v1.17.12
	github.com/aws/aws-sdk-go-v2/service/s3 v1.58.3
	github.com/docker/docker v27.1.1+incompatible
	github.com/docker/go-connections v0.5.0
	github.com/go-chi/chi/v5 v5.1.0
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/gorilla/websocket v1.5.3
	github.com/pkg/sftp v1.13.6
	github.com/prometheus/client_golang v1.19.1
	github.com/rs/zerolog v1.33.0
	github.com/spf13/cobra v1.8.1
	github.com/spf13/viper v1.19.0
	golang.org/x/crypto v0.25.0
	golang.org/x/sys v0.22.0
)
