# Cloud Run Deployment Checklist

## ✅ Already Configured

1. **Dockerfile** - Configured with Node.js 18, exposes port 8080
2. **cloudbuild.yaml** - Automated build and deployment configuration
3. **server.js** - Listens on 0.0.0.0 and uses PORT environment variable
4. **.dockerignore** - Excludes unnecessary files from Docker build

## 🔧 Required Configuration Steps

### 1. Set Your GCP Project ID

Update `cloudbuild.yaml` with your actual project ID, or use the `$PROJECT_ID` variable (which is automatically set by Cloud Build).

**Option A: Use environment variable (recommended)**
```yaml
# Already configured - $PROJECT_ID is automatically available
```

**Option B: Hardcode your project ID**
```yaml
# Replace $PROJECT_ID with your actual project ID
args: ['build', '-t', 'gcr.io/YOUR_ACTUAL_PROJECT_ID/map-service', '.']
```

### 2. Enable Required Google Cloud APIs

Run these commands to enable necessary APIs:

```bash
# Enable Cloud Run API
gcloud services enable run.googleapis.com

# Enable Cloud Build API
gcloud services enable cloudbuild.googleapis.com

# Enable Container Registry API (if using GCR)
gcloud services enable containerregistry.googleapis.com

# Or enable Artifact Registry API (recommended for new projects)
gcloud services enable artifactregistry.googleapis.com
```

### 3. Set Up Cloud Build Permissions

Grant Cloud Build the necessary permissions to deploy to Cloud Run:

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

# Grant Cloud Build service account Cloud Run Admin role
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

# Grant Cloud Build service account Service Account User role
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 4. Configure Cloud Run Service Settings

When deploying, you may want to configure:

**Memory and CPU:**
```bash
gcloud run deploy map-service \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --min-instances 0
```

**Environment Variables (if needed):**
```bash
gcloud run deploy map-service \
  --set-env-vars "NODE_ENV=production"
```

### 5. Update PORT Configuration (Optional - Already Works)

The current setup works, but for consistency:
- Dockerfile sets `ENV PORT=8080`
- server.js defaults to `process.env.PORT || 3000`
- Cloud Run will set PORT automatically

**This is fine as-is**, but if you want consistency, you could update server.js:
```javascript
const PORT = process.env.PORT || 8080; // Match Dockerfile default
```

### 6. Set Up Custom Domain (Optional)

If you need a custom domain:

```bash
gcloud run domain-mappings create \
  --service map-service \
  --domain your-domain.com \
  --region us-central1
```

### 7. Configure CORS (If Needed)

If you need to allow specific origins, update the CORS headers in `server.js`:

```javascript
// Currently allows all origins (*)
// Update if you need specific domains
res.setHeader('Access-Control-Allow-Origin', 'https://yourdomain.com');
```

## 🚀 Deployment Commands

### Quick Deploy (Recommended)
```bash
gcloud run deploy map-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --platform managed
```

### Deploy with Cloud Build
```bash
gcloud builds submit --config cloudbuild.yaml
```

### Manual Docker Build & Deploy
```bash
# Build
docker build -t gcr.io/$(gcloud config get-value project)/map-service .

# Push
docker push gcr.io/$(gcloud config get-value project)/map-service

# Deploy
gcloud run deploy map-service \
  --image gcr.io/$(gcloud config get-value project)/map-service \
  --region us-central1 \
  --allow-unauthenticated
```

## 📋 Pre-Deployment Checklist

- [ ] GCP project is set: `gcloud config set project YOUR_PROJECT_ID`
- [ ] Required APIs are enabled (Cloud Run, Cloud Build, Container Registry/Artifact Registry)
- [ ] Cloud Build has necessary IAM permissions
- [ ] `package.json` has all dependencies listed
- [ ] Tested locally: `npm start` works
- [ ] Docker build works: `docker build -t test .`
- [ ] Mapbox token is hardcoded in `map_view.js` (or consider using environment variable)

## 🔒 Security Considerations

1. **Mapbox Token**: Currently hardcoded. Consider moving to environment variable:
   ```javascript
   const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || 'your-token';
   ```

2. **CORS**: Currently allows all origins. Restrict if needed.

3. **Rate Limiting**: Consider adding rate limiting for API endpoints.

## 🐛 Troubleshooting

### Build fails
- Check that all files are present (map_view.html, map_view.js, scan_service.js)
- Verify package.json has correct dependencies
- Check Dockerfile syntax

### Deployment fails
- Verify Cloud Build has IAM permissions
- Check that APIs are enabled
- Review Cloud Build logs: `gcloud builds list`

### Service doesn't start
- Check Cloud Run logs: `gcloud run services logs read map-service`
- Verify PORT is being set correctly
- Check that server.js is the entry point

### 502 Bad Gateway
- Check that the service is listening on 0.0.0.0 (already configured)
- Verify PORT environment variable is set
- Check service logs for errors
