# Servidor HTTP local minimo (sem instalar nada) para abrir o painel em http://localhost:8080
# Uso: botao direito > "Executar com o PowerShell", ou:
#   powershell -ExecutionPolicy Bypass -File servidor-local.ps1
param([int]$Port = 8080, [switch]$NoBrowser)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Painel disponivel em http://localhost:$Port/  (Ctrl+C para encerrar)"
if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }

$types = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json"; ".svg" = "image/svg+xml"; ".png" = "image/png"; ".ico" = "image/x-icon"; ".md" = "text/plain; charset=utf-8"
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
      if ([string]::IsNullOrEmpty($path)) { $path = "index.html" }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if ($file.StartsWith($root) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
        $res.Headers.Add("Cache-Control", "no-cache")
        $res.Headers.Add("Access-Control-Allow-Origin", "*")
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
    } catch {
      Write-Warning $_.Exception.Message
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
