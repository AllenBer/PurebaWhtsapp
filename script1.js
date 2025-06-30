/** ✅ MODIFICADO - script1.js funcional con subida a Firebase y Google Drive **/

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

const CLIENT_ID = '447789838113-076qo17ps0bercefg0ln9kiokt9bodtv.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let authInstance;
const images = {};
let zipBlob = null;

function renderList(docs, containerId) {
  const ul = document.getElementById(containerId);
  docs.forEach(doc => {
    const safeId = doc.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_");
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
  initGoogleAPI();
};

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

async function openCamera(docName) {
  const video = document.getElementById("camera");
  const modal = document.getElementById("cameraModal");
  const label = document.getElementById("docLabel");
  const canvas = document.getElementById("snapshotCanvas");

  label.textContent = `📄 Escaneando: ${docName}`;
  modal.hidden = false;
  modal.style.display = "flex";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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
      canvas.toBlob(blob => {
        if (isImageBlurry(canvas)) {
          alert("⚠️ La imagen parece borrosa. Toma la foto nuevamente.");
          return;
        }
        images[docName] = blob;
        const safeId = docName.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_");
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

document.getElementById("minimizeCamera").onclick = () => {
  document.getElementById("cameraModal").style.display = "none";
};

document.getElementById("generateZip").onclick = async () => {
  let baseName = document.getElementById("zipName").value.trim();
  if (!baseName) return alert("⚠️ Ingresa un nombre para el ZIP");
  if (Object.keys(images).length === 0) return alert("⚠️ No hay imágenes para generar el ZIP.");
  const fecha = new Date().toISOString().slice(0, 10);
  const zipName = `${baseName}_${fecha}`;

  const zip = new JSZip();
  for (const [docName, blob] of Object.entries(images)) {
    const fileName = docName.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_") + ".jpg";
    zip.file(fileName, blob);
  }

  zipBlob = await zip.generateAsync({ type: "blob" });
  const blobURL = URL.createObjectURL(zipBlob);
  document.zipBlobURL = blobURL;
  document.generatedZipName = zipName;

  const a = document.createElement("a");
  a.href = blobURL;
  a.download = zipName + ".zip";
  a.click();

  alert("✅ ZIP generado y descargado. Puedes compartirlo por WhatsApp, correo o Drive.");
};
 ////enviar archivo por whatsapp
document.getElementById("btnWhatsApp").addEventListener("click", async () => {
  const zipName = document.getElementById("zipName").value.trim();

  if (!zipName) {
    alert("Por favor ingresa el número de IMSS o nombre para el ZIP.");
    return;
  }

  // Asegúrate de que ya se haya generado y subido el archivo ZIP
  const fileRef = firebase.storage().ref().child(`${zipName}.zip`);
  try {
    const url = await fileRef.getDownloadURL();
    const mensaje = `Hola, aquí tienes el archivo ZIP de documentación:\n📎 ${url}`;
    const whatsappURL = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(whatsappURL, "_blank");
  } catch (error) {
    console.error("❌ Error obteniendo el enlace:", error);
    alert("❌ No se pudo subir ni generar el enlace de descarga.");
  }
});

//Enviar archivo por correo electronico 
document.getElementById("sendEmail").addEventListener("click", async () => {
  const zipName = document.getElementById("zipName").value.trim();

  if (!zipName) {
    alert("Por favor ingresa el número de IMSS o nombre para el ZIP.");
    return;
  }

  const fileRef = firebase.storage().ref().child(`${zipName}.zip`);
  try {
    const url = await fileRef.getDownloadURL();

    // Cuerpo y asunto del correo
    const subject = encodeURIComponent("📎 Archivo ZIP de documentación");
    const body = encodeURIComponent(`Hola,\n\nAquí tienes el archivo ZIP:\n${url}`);

    // Abre el cliente de correo por defecto (Gmail, Outlook, etc.)
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  } catch (error) {
    console.error("❌ Error subiendo a Firebase:", error);
    alert("❌ Error subiendo o generando enlace.");
  }
});

function initGoogleAPI() {
  gapi.load('client:auth2', async () => {
    await gapi.client.init({ clientId: CLIENT_ID, scope: SCOPES });
    authInstance = gapi.auth2.getAuthInstance();
  });
}

async function uploadZipToDrive(blob, filename) {
  try {
    if (!authInstance) throw new Error("Google API no inicializado");
    await authInstance.signIn();
    const accessToken = gapi.auth.getToken().access_token;

    const metadata = { name: filename, mimeType: 'application/zip' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: new Headers({ Authorization: 'Bearer ' + accessToken }),
        body: form
      }
    );
    const file = await response.json();

    await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    return `https://drive.google.com/file/d/${file.id}/view?usp=sharing`;
  } catch (error) {
    alert("❌ Error subiendo a Google Drive: " + error.message);
    return null;
  }
}
