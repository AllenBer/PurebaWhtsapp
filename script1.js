const generalDocs = [
  "Formato de alta", "Solicitud de empleo", "Copia del acta de nacimiento", "Número de IMSS", "CURP",
  "Copia de comprobante de estudios", "Copia de comprobante de domicilio", "Credencial de elector (Frente)",
  "Credencial de elector (Reverso)","Guía de entrevista", "Carta de identidad (solo menores)"
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

    ///////////generar archivo zip
  

document.getElementById("generateZip").onclick = async () => {
  const baseName = document.getElementById("zipName").value.trim();
  if (!baseName) return alert("⚠️ Ingresa un nombre para el ZIP");
  if (Object.keys(images).length === 0) return alert("⚠️ No hay imágenes para generar el ZIP.");

  const fecha = new Date().toISOString().slice(0, 10);
  const zipName = `${baseName}_${fecha}`;

  const comprimidas = await comprimirExactoPorImagen(images);

  if (!comprimidas) {
    const continuar = confirm("⚠️ El total comprimido excede los 4 MB o hay imágenes inválidas. ¿Deseas continuar con las originales?");
    if (!continuar) return;
  }

  const loteZip = comprimidas ? comprimidas : images;
  zipBlob = await generarZipReducido(loteZip, zipName, 4);

  if (!zipBlob) return alert("❌ Error al generar el ZIP.");

  const blobURL = URL.createObjectURL(zipBlob);
  document.zipBlobURL = blobURL;
  document.generatedZipName = zipName;

  const a = document.createElement("a");
  a.href = blobURL;
  a.download = zipName + ".zip";
  a.click();

  alert("✅ ZIP generado y descargado.");
};



///////dercargar archivo pdf 

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

    const comprimidas = await comprimirExactoPorImagen(images);

    if (!comprimidas) {
      const continuar = confirm("⚠️ El total comprimido excede los 4 MB o hay imágenes inválidas. ¿Deseas continuar con las originales?");
      if (!continuar) return;
    }

    const lotePDF = comprimidas ? comprimidas : images;
    const finalPDFBlob = await generarPDFReducido(lotePDF, 4);

    const nombre = document.getElementById("zipName").value.trim() || "documentos";
    const fecha = new Date().toISOString().slice(0, 10);
    const fileName = `${nombre}_${fecha}.pdf`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(finalPDFBlob);
    a.download = fileName;
    a.click();

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
//////////////////////////////////////////////////
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
function recortarCentro(canvas, porcentaje = 0.85) {
  const ctx = canvas.getContext("2d");
  const ancho = canvas.width;
  const alto = canvas.height;
  const nuevoAncho = ancho * porcentaje;
  const nuevoAlto = alto * porcentaje;
  const x = (ancho - nuevoAncho) / 2;
  const y = (alto - nuevoAlto) / 2;

  const imagenRecortada = ctx.getImageData(x, y, nuevoAncho, nuevoAlto);
  const nuevoCanvas = document.createElement("canvas");
  nuevoCanvas.width = nuevoAncho;
  nuevoCanvas.height = nuevoAlto;
  nuevoCanvas.getContext("2d").putImageData(imagenRecortada, 0, 0);
  return nuevoCanvas;
}


/////////////////////////////////////////////////////
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
/////////////////////////////////kljkfgjbfgjk
async function generarZipReducido(imagenes, nombreZip, maxMB = 4) {
  const maxBytes = maxMB * 1024 * 1024;
  const calidades = [1.0, 0.9, 0.8, 0.7];

  let content;

  for (const calidad of calidades) {
    const zip = new JSZip();

    for (const [docName, blob] of Object.entries(imagenes)) {
      const comprimida = await compressImage(blob, 1600, calidad);

      const nombre = docName.replace(/[^\w\s]/gi, "_") + ".jpg";
      zip.file(nombre, comprimida);
    }

    content = await zip.generateAsync({ type: "blob" });

    if (content.size <= maxBytes) {
      console.log(`✅ ZIP comprimido a ${(content.size / 1024 / 1024).toFixed(4)} MB con calidad ${calidad}`);
      return content;
    }
  }

  console.warn("⚠️ No se pudo reducir el ZIP a menos de 2MB sin perder calidad visual.");
  return content;
}

////////////////////////////////PDF
async function generarPDFReducido(imagenes, maxMB = 4) {
  const maxBytes = maxMB * 1024 * 1024;
  const calidades = [0.9, 0.7, 0.5, 0.3];
  let finalBlob;

  for (const calidad of calidades) {
    const pdf = new jsPDF();

    const entries = Object.entries(imagenes);
    for (let i = 0; i < entries.length; i++) {
      const [, blob] = entries[i]; // ya no usamos docName
      const comprimida = await compressImage(blob, 1024, calidad);
      const imageDataUrl = await blobToDataURL(comprimida);

      const imgProps = pdf.getImageProperties(imageDataUrl);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Sin márgenes, imagen expandida
      const drawWidth = pageWidth;
      const drawHeight = pageHeight;
      const x = 0;
      const y = 0;

      if (i > 0) pdf.addPage();
      pdf.addImage(imageDataUrl, "JPEG", x, y, drawWidth, drawHeight, undefined, "FAST");
    }

    finalBlob = pdf.output("blob"); // ← Asegura formato correcto
    if (finalBlob.size <= maxBytes) {
      console.log(`✅ PDF comprimido a ${(finalBlob.size / 1024 / 1024).toFixed(4)} MB con calidad ${calidad}`);
      return finalBlob;
    }
  }

  console.warn("⚠️ No se pudo reducir el PDF debajo de 4 MB sin perder calidad visual.");
  return finalBlob;
}
//////////////////////////////////////////////////
async function verificarTamañoYComprimir(blob, tipo = "PDF", maxMB = 2) {
  const maxBytes = maxMB * 1024 * 1024;
  if (blob.size <= maxBytes) return blob;

  const intentos = [0.7, 0.5, 0.3];
  let finalBlob = blob;

  for (const calidad of intentos) {
    const pdf = new jsPDF();
    const entries = Object.entries(images);

    for (let i = 0; i < entries.length; i++) {
      const [, blob] = entries[i];
      const compressed = await compressImage(blob, 700, calidad);
      const imageDataUrl = await blobToDataURL(compressed);

      const imgProps = pdf.getImageProperties(imageDataUrl);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const drawWidth = pageWidth;
      const drawHeight = pageHeight;
      const x = 0;
      const y = 0;

      if (i > 0) pdf.addPage();
      pdf.addImage(imageDataUrl, "JPEG", x, y, drawWidth, drawHeight, undefined, "FAST");
    }

    finalBlob = pdf.output("blob");

    if (finalBlob.size <= maxBytes) {
      console.log(`✅ PDF comprimido a ${(finalBlob.size / 1024 / 1024).toFixed(4)} MB con calidad ${calidad}`);
      return finalBlob;
    }
  }

  console.warn("⚠️ No se pudo reducir el PDF debajo de 2 MB sin perder mucha calidad.");
  return finalBlob;
}
/////////////////////////////////////////////////////////////////////////////
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const TARGET_PER_IMAGE = Math.floor(MAX_TOTAL_BYTES / 23); // ≈ 178KB
const MIN_QUALITY = 0.5;

async function comprimirExactoPorImagen(imagenes) {
  const resultado = {};
  let totalAcumulado = 0;

  for (const [nombre, blobOriginal] of Object.entries(imagenes)) {
    let calidad = 0.85;
    let comprimida = await compressImage(blobOriginal, 1400, calidad);

    while (comprimida.size > TARGET_PER_IMAGE && calidad > MIN_QUALITY) {
      calidad -= 0.05;
      comprimida = await compressImage(blobOriginal, 1400, calidad);
    }

    if (comprimida.size <= TARGET_PER_IMAGE) {
      resultado[nombre] = comprimida;
      totalAcumulado += comprimida.size;
      console.log(`✅ ${nombre}: ${(comprimida.size / 1024).toFixed(1)} KB [calidad ${calidad.toFixed(2)}]`);
    } else {
      alert(`🚫 ${nombre} no pudo comprimirse debajo de 178 KB. Debes reescanearla.`);
    }
  }

  console.log(`📊 Total acumulado: ${(totalAcumulado / 1024 / 1024).toFixed(2)} MB`);

  if (totalAcumulado > MAX_TOTAL_BYTES) return null;
  return resultado;
}
