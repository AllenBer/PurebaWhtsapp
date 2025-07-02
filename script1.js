const generalDocs = [
  "Formato de alta", "Solicitud de empleo", "Copia del acta de nacimiento", "Número de IMSS", "CURP",
  "Copia de comprobante de estudios", "Copia de comprobante de domicilio", "Credencial de elector",
  "Guía de entrevista", "Carta de identidad (solo menores)"
];

const empresaDocs = [
  "Permiso firmado por tutor", "Identificación oficial tutor", "Carta responsiva", "Políticas de la empresa",
  "Políticas de propina", "Convenio de manipulaciones", "Convenio de correo electrónico", "Vale de uniforme",
  "Apertura de cuentas", "Contrato laboral", "Responsiva tarjeta de nómina", "Cuenta Santander"
];

window.jsPDF = window.jspdf?.jsPDF || window.jsPDF;

const CLIENT_ID = '447789838113-076qo17ps0bercefg0ln9kiokt9bodtv.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let authInstance;
const images = {};
let zipBlob = null;

function compressImage(blob, maxWidth = 700, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((compressedBlob) => {
        resolve(compressedBlob);
        URL.revokeObjectURL(url);
      }, "image/jpeg", quality);
    };
    img.src = url;
  });
}

function renderList(docs, containerId) {
  const ul = document.getElementById(containerId);
  docs.forEach(doc => {
    const safeId = doc.replace(/[^ -\u007F]+|[^\w\s]/gi, '').replace(/\s+/g, "_");
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="doc-label">${doc}</span>
      <span class="doc-status" id="status-${safeId}">❌</span>
      <button onclick="openCamera('${doc}')">📷 Escanear</button>
    `;
    ul.appendChild(li);
  });
}

window.onload = () => {
  renderList(generalDocs, "doc-general");
  renderList(empresaDocs, "doc-empresa");

  document.getElementById("generateZip").onclick = async () => {
    const baseName = document.getElementById("zipName").value.trim();
    if (!baseName) return alert("⚠️ Ingresa un nombre para el ZIP");
    if (Object.keys(images).length === 0) return alert("⚠️ No hay imágenes para generar el ZIP.");

    const fecha = new Date().toISOString().slice(0, 10);
    const zipName = `${baseName}_${fecha}`;
    const zip = new JSZip();

    for (const [docName, blob] of Object.entries(images)) {
      const fileName = docName.replace(/[^ -\u007F]+|[^\w\s]/gi, '').replace(/\s+/g, "_") + ".jpg";
      zip.file(fileName, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    zipBlob = content;

    const blobURL = URL.createObjectURL(content);
    document.zipBlobURL = blobURL;
    document.generatedZipName = zipName;

    const a = document.createElement("a");
    a.href = blobURL;
    a.download = zipName + ".zip";
    a.click();

    alert("✅ ZIP generado y descargado.");
  };

  document.getElementById("downloadPDF").onclick = async () => {
    const statusBox = document.createElement("div");
    statusBox.style = "position:fixed;bottom:1rem;right:1rem;background:#fff;border:2px solid #333;padding:1rem;z-index:9999;font-family:monospace;";
    statusBox.innerText = "⏳ Generando PDF...";
    document.body.appendChild(statusBox);

    try {
      if (typeof jsPDF !== "function") {
        statusBox.innerText = "❌ jsPDF no está disponible.";
        return;
      }

      if (!zipBlob) {
        statusBox.innerText = "⚠️ Primero genera el ZIP antes de descargar el PDF.";
        return;
      }

      if (Object.keys(images).length === 0) {
        statusBox.innerText = "⚠️ No hay imágenes para generar el PDF.";
        return;
      }

      const pdf = new jsPDF();
      const entries = Object.entries(images);

      for (let i = 0; i < entries.length; i++) {
        const [docName, blob] = entries[i];
        const imageDataUrl = await blobToDataURL(blob);

        const imgProps = pdf.getImageProperties(imageDataUrl);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        if (i > 0) pdf.addPage();
        pdf.addImage(imageDataUrl, "JPEG", 0, 0, pdfWidth, pdfHeight);
      }

      const fecha = new Date().toISOString().slice(0, 10);
      const nombre = document.getElementById("zipName").value.trim() || "documentos";
      const fileName = `${nombre}_${fecha}.pdf`;

      pdf.save(fileName);
      statusBox.innerText = `✅ PDF generado: ${fileName}`;
    } catch (err) {
      console.error("❌ Error al generar el PDF:", err);
      statusBox.innerText = "❌ Error al generar el PDF. Revisa la consola.";
    }

    setTimeout(() => statusBox.remove(), 8000);
  };

  document.getElementById("minimizeCamera").onclick = () => {
    document.getElementById("cameraModal").style.display = "none";
  };
};

async function openCamera(docName) {
  const video = document.getElementById("camera");
  const modal = document.getElementById("cameraModal");
  const label = document.getElementById("docLabel");
  const canvas = document.getElementById("snapshotCanvas");

  label.textContent = `📄 Escaneando: ${docName}`;
  modal.hidden = false;
  modal.style.display = "flex";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    video.srcObject = stream;

    const oldBtn = document.getElementById("captureBtn");
    const newBtn = oldBtn.cloneNode(true);
    newBtn.id = "captureBtn";
    oldBtn.replaceWith(newBtn);

    newBtn.onclick = () => {
      const context = canvas.getContext("2d");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (isImageBlurry(canvas)) {
          alert("⚠️ La imagen parece borrosa. Toma la foto nuevamente.");
          return;
        }

        const compressed = await compressImage(blob);
        images[docName] = compressed;

        const safeId = docName.replace(/[^ -\u007F]+|[^\w\s]/gi, '').replace(/\s+/g, "_");
        const statusSpan = document.getElementById(`status-${safeId}`);
        if (statusSpan) statusSpan.textContent = "✅";

        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        modal.hidden = true;
      }, "image/jpeg", 0.9);
    };
  } catch (err) {
    alert("🚫 Error al activar la cámara: " + err.message);
    modal.hidden = true;
  }
}

function isImageBlurry(canvas, threshold = 20) {
  const context = canvas.getContext("2d");
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const grayValues = [];

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    const gray = (r + g + b) / 3;
    grayValues.push(gray);
  }

  const avg = grayValues.reduce((a, b) => a + b, 0) / grayValues.length;
  const variance = grayValues.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / grayValues.length;

  return variance < threshold;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
