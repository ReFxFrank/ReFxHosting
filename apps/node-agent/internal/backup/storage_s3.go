package backup

import (
	"context"
	"fmt"
	"io"

	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Config configures the S3 / S3-compatible (MinIO) backup store.
type S3Config struct {
	Endpoint     string // empty for AWS; set for MinIO/other
	Region       string
	Bucket       string
	AccessKey    string
	SecretKey    string
	UsePathStyle bool
}

// S3Storage persists backups to an S3-compatible bucket.
type S3Storage struct {
	bucket   string
	client   *s3.Client
	uploader *manager.Uploader
}

// NewS3Storage builds an S3-backed store. It supports custom endpoints so MinIO
// and other S3-compatible providers work unchanged.
func NewS3Storage(ctx context.Context, cfg S3Config) (*S3Storage, error) {
	loadOpts := []func(*awscfg.LoadOptions) error{
		awscfg.WithRegion(cfg.Region),
	}
	if cfg.AccessKey != "" {
		loadOpts = append(loadOpts, awscfg.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		))
	}
	awsCfg, err := awscfg.LoadDefaultConfig(ctx, loadOpts...)
	if err != nil {
		return nil, fmt.Errorf("s3: load config: %w", err)
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
		o.UsePathStyle = cfg.UsePathStyle
	})
	return &S3Storage{
		bucket:   cfg.Bucket,
		client:   client,
		uploader: manager.NewUploader(client),
	}, nil
}

// Put streams the archive to S3 using a multipart uploader and returns the key.
func (s *S3Storage) Put(ctx context.Context, key string, r io.Reader, _ int64) (string, error) {
	_, err := s.uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
		Body:   r,
	})
	if err != nil {
		return "", fmt.Errorf("s3: upload: %w", err)
	}
	return key, nil
}

// Presign returns a time-limited GET URL for the object so browsers can
// download straight from object storage — full S3/CDN bandwidth and native
// resume, instead of relaying every byte through node and panel.
func (s *S3Storage) Presign(ctx context.Context, location string, ttl time.Duration) (string, error) {
	presigner := s3.NewPresignClient(s.client)
	out, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(location),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("s3: presign: %w", err)
	}
	return out.URL, nil
}

// Get streams an archive back from S3.
func (s *S3Storage) Get(ctx context.Context, location string) (io.ReadCloser, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(location),
	})
	if err != nil {
		return nil, fmt.Errorf("s3: get: %w", err)
	}
	return out.Body, nil
}

// Delete removes an archive from S3.
func (s *S3Storage) Delete(ctx context.Context, location string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(location),
	})
	return err
}

var _ Storage = (*S3Storage)(nil)
