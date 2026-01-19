# Map Service

A simple Express.js service deployed on Google Cloud Run.

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Run the server:
```bash
npm start
```

The server will start on `http://localhost:3000`

## Deploying to Cloud Run

### Option 1: Deploy using gcloud CLI

1. Build and deploy using gcloud:
```bash
gcloud run deploy map-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### Option 2: Build Docker image and deploy manually

1. Build the Docker image:
```bash
docker build -t gcr.io/YOUR_PROJECT_ID/map-service .
```

2. Push to Google Container Registry:
```bash
docker push gcr.io/YOUR_PROJECT_ID/map-service
```

3. Deploy to Cloud Run:
```bash
gcloud run deploy map-service \
  --image gcr.io/YOUR_PROJECT_ID/map-service \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

### Option 3: Automated deployment with Cloud Build

1. Submit the build:
```bash
gcloud builds submit --config cloudbuild.yaml
```

Make sure to replace `YOUR_PROJECT_ID` with your actual GCP project ID.

## Environment Variables

- `PORT`: Server port (default: 3000, Cloud Run sets this automatically)
