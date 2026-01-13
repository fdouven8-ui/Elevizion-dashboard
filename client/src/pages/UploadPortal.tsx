import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle, XCircle, AlertTriangle, FileVideo, Info } from "lucide-react";

interface PortalInfo {
  companyName: string;
  linkKey: string;
  duration: number;
  displaySpecs: string;
}

interface ValidationResult {
  isValid: boolean;
  metadata: any;
  errors: string[];
  warnings: string[];
}

interface UploadResponse {
  success: boolean;
  message: string;
  assetId?: string;
  validation?: ValidationResult;
}

export default function UploadPortal() {
  const { token } = useParams<{ token: string }>();
  const [portalInfo, setPortalInfo] = useState<PortalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    async function fetchPortalInfo() {
      try {
        const response = await fetch(`/api/upload-portal/${token}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Ongeldige toegangslink");
        }
        const data = await response.json();
        setPortalInfo(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (token) {
      fetchPortalInfo();
    }
  }, [token]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4")) {
        setSelectedFile(file);
        setUploadResult(null);
      } else {
        setError("Alleen MP4 bestanden zijn toegestaan.");
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !token) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append("video", selectedFile);

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.onload = () => {
        setUploading(false);
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 400) {
            setError(response.message || `Serverfout (${xhr.status})`);
            if (response.validation) {
              setUploadResult(response);
            }
          } else {
            setUploadResult(response);
            if (response.success) {
              setSelectedFile(null);
            }
          }
        } catch {
          setError(`Onverwachte serverfout (${xhr.status})`);
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        setError("Upload mislukt. Controleer uw internetverbinding.");
      };

      xhr.open("POST", `/api/upload-portal/${token}/upload`);
      xhr.send(formData);
    } catch (err: any) {
      setUploading(false);
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" data-testid="loading-state">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Laden...</p>
        </div>
      </div>
    );
  }

  if (error && !portalInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" data-testid="error-state">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <XCircle className="h-6 w-6" />
              Toegang Geweigerd
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">{error}</p>
            <p className="mt-4 text-sm text-gray-500">
              Neem contact op met Elevizion als u denkt dat dit een fout is.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4" data-testid="upload-portal">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900" data-testid="portal-title">
            Video Upload Portal
          </h1>
          <p className="mt-2 text-gray-600">
            Upload uw advertentievideo voor <strong>{portalInfo?.companyName}</strong>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              Videospecificaties
            </CardTitle>
            <CardDescription>
              Zorg dat uw video aan deze specificaties voldoet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 rounded-lg p-4 text-sm whitespace-pre-line" data-testid="video-specs">
              {portalInfo?.displaySpecs}
            </div>
            <Alert className="mt-4" variant="default">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Bestandsnaam (verplicht)</AlertTitle>
              <AlertDescription>
                Uw bestandsnaam <strong>moet beginnen met</strong>: <code className="bg-blue-100 px-1">{portalInfo?.linkKey}_</code>
                <br />
                Voorbeeld: <code className="bg-gray-100 px-1">{portalInfo?.linkKey}_Bedrijfsnaam.mp4</code>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Video
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? "border-blue-500 bg-blue-50"
                  : selectedFile
                  ? "border-green-500 bg-green-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              data-testid="dropzone"
            >
              {selectedFile ? (
                <div className="space-y-4">
                  <FileVideo className="h-12 w-12 mx-auto text-green-600" />
                  <div>
                    <p className="font-medium text-green-800" data-testid="selected-filename">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedFile(null)}
                    disabled={uploading}
                    data-testid="button-clear-file"
                  >
                    Ander bestand kiezen
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="h-12 w-12 mx-auto text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-700">
                      Sleep uw MP4 bestand hierheen
                    </p>
                    <p className="text-sm text-gray-500">of klik om te bladeren</p>
                  </div>
                  <input
                    type="file"
                    accept="video/mp4,.mp4"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-input"
                    data-testid="input-file"
                  />
                  <label htmlFor="file-input">
                    <Button variant="outline" asChild>
                      <span>Bestand kiezen</span>
                    </Button>
                  </label>
                </div>
              )}
            </div>

            {uploading && (
              <div className="mt-4 space-y-2" data-testid="upload-progress">
                <Progress value={uploadProgress} />
                <p className="text-sm text-center text-gray-600">
                  Uploaden... {uploadProgress}%
                </p>
              </div>
            )}

            {selectedFile && !uploading && (
              <Button
                className="w-full mt-4"
                onClick={handleUpload}
                data-testid="button-upload"
              >
                <Upload className="h-4 w-4 mr-2" />
                Video Uploaden
              </Button>
            )}

            {error && (
              <Alert className="mt-4" variant="destructive" data-testid="error-message">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {uploadResult && (
              <div className="mt-4 space-y-4" data-testid="upload-result">
                {uploadResult.success && uploadResult.validation?.isValid ? (
                  <Alert className="bg-green-50 border-green-200" data-testid="success-alert">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">Succes!</AlertTitle>
                    <AlertDescription className="text-green-700">
                      {uploadResult.message}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive" data-testid="validation-errors">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Validatiefout</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        {uploadResult.validation?.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {uploadResult.validation?.warnings && uploadResult.validation.warnings.length > 0 && (
                  <Alert className="bg-yellow-50 border-yellow-200" data-testid="validation-warnings">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle className="text-yellow-800">Waarschuwingen</AlertTitle>
                    <AlertDescription className="text-yellow-700">
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        {uploadResult.validation.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {uploadResult.validation?.metadata && (
                  <Card className="bg-gray-50">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Gedetecteerde video-eigenschappen</CardTitle>
                    </CardHeader>
                    <CardContent className="py-3">
                      <dl className="grid grid-cols-2 gap-2 text-sm" data-testid="video-metadata">
                        <dt className="text-gray-500">Duur:</dt>
                        <dd>{uploadResult.validation.metadata.durationSeconds?.toFixed(1)}s</dd>
                        <dt className="text-gray-500">Resolutie:</dt>
                        <dd>{uploadResult.validation.metadata.width}x{uploadResult.validation.metadata.height}</dd>
                        <dt className="text-gray-500">Codec:</dt>
                        <dd>{uploadResult.validation.metadata.codec}</dd>
                        <dt className="text-gray-500">Audio:</dt>
                        <dd>{uploadResult.validation.metadata.hasAudio ? "Ja" : "Nee"}</dd>
                      </dl>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-500">
          Vragen? Neem contact op met{" "}
          <a href="mailto:info@elevizion.nl" className="text-blue-600 hover:underline">
            info@elevizion.nl
          </a>
        </p>
      </div>
    </div>
  );
}
