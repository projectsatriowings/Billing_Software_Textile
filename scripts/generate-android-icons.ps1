# scripts/generate-android-icons.ps1
param (
    [string]$SrcPath = "client/public/icon.png"
)

Add-Type -AssemblyName System.Drawing

function Resize-Image([System.Drawing.Image]$src, [string]$dst, [int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap([int]$w, [int]$h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, [int]$w, [int]$h)
    $g.Dispose()
    $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

function Create-Foreground([System.Drawing.Image]$src, [string]$dst, [int]$totalSize, [int]$iconSize) {
    $bmp = New-Object System.Drawing.Bitmap([int]$totalSize, [int]$totalSize)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $x = [int](($totalSize - $iconSize) / 2)
    $y = [int](($totalSize - $iconSize) / 2)
    $g.DrawImage($src, $x, $y, [int]$iconSize, [int]$iconSize)
    $g.Dispose()
    $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

function Create-Splash([System.Drawing.Image]$src, [string]$dst, [int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap([int]$w, [int]$h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $bgColor = [System.Drawing.ColorTranslator]::FromHtml("#49364A")
    $g.Clear($bgColor)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $minDim = [Math]::Min($w, $h)
    $logoSize = [int][Math]::Round($minDim * 0.38)
    $x = [int](($w - $logoSize) / 2)
    $y = [int](($h - $logoSize) / 2)
    $g.DrawImage($src, $x, $y, [int]$logoSize, [int]$logoSize)
    $g.Dispose()
    $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$fullSrc = (Resolve-Path $SrcPath).Path
$srcImg = [System.Drawing.Image]::FromFile($fullSrc)

# 1. Launcher icons
$mipmaps = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

foreach ($kv in $mipmaps.GetEnumerator()) {
    $dir = Join-Path "android/app/src/main/res" $kv.Key
    $size = [int]$kv.Value
    Resize-Image $srcImg (Join-Path $dir "ic_launcher.png") $size $size
    Resize-Image $srcImg (Join-Path $dir "ic_launcher_round.png") $size $size
    
    $fgSize = [int][Math]::Round($size * 2.25)
    $fgIconSize = [int][Math]::Round($size * 1.5)
    Create-Foreground $srcImg (Join-Path $dir "ic_launcher_foreground.png") $fgSize $fgIconSize
}

# 2. Splash drawables
$splashes = @{
    "drawable" = @{ w = 480; h = 320 }
    "drawable-land-mdpi" = @{ w = 480; h = 320 }
    "drawable-land-hdpi" = @{ w = 800; h = 480 }
    "drawable-land-xhdpi" = @{ w = 1280; h = 720 }
    "drawable-land-xxhdpi" = @{ w = 1600; h = 960 }
    "drawable-land-xxxhdpi" = @{ w = 1920; h = 1280 }
    "drawable-port-mdpi" = @{ w = 320; h = 480 }
    "drawable-port-hdpi" = @{ w = 480; h = 800 }
    "drawable-port-xhdpi" = @{ w = 720; h = 1280 }
    "drawable-port-xxhdpi" = @{ w = 960; h = 1600 }
    "drawable-port-xxxhdpi" = @{ w = 1280; h = 1920 }
}

foreach ($kv in $splashes.GetEnumerator()) {
    $dir = Join-Path "android/app/src/main/res" $kv.Key
    $dims = $kv.Value
    Create-Splash $srcImg (Join-Path $dir "splash.png") ([int]$dims.w) ([int]$dims.h)
}

$srcImg.Dispose()
Write-Output "✅ Generated all Android launcher icons and splash screens successfully!"
