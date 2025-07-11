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



const images = {};
let cropper = null;
let currentDoc = null;
let liveStream = null;
let cv = null;

function onOpenCvReady() {
    cv = window.cv;
    if (cv) console.log("✅ OpenCV.js listo");
    else alert("⚠️ No se pudo cargar OpenCV.js");
}

window.onload = () => {
    const container = document.getElementById('document-container');
    documents.forEach((doc, index) => {
        const safeId = doc.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_");
        const div = document.createElement("div");
        div.className = "document-box";
        div.innerHTML = `
    <label>${index + 1}. ${doc}</label>
    <button onclick="startCamera('${doc}')">📸 Escanear</button>
    <button onclick="openCrop('${doc}')">✂️ Recortar</button>
    <span id="status-${safeId}">❌</span>
    <img id="preview-${safeId}" class="image-preview" style="display:none;"/>
`;

        container.appendChild(div);
    });
};

function startCamera(docName) {
    currentDoc = docName;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
            liveStream = stream;
            document.getElementById("live-video").srcObject = stream;
            document.getElementById("live-camera-modal").style.display = "flex";
        })
        .catch((err) => alert("🚫 Error al activar la cámara: " + err.message));
}

function closeLiveCamera() {
    document.getElementById("live-camera-modal").style.display = "none";
    if (liveStream) {
        liveStream.getTracks().forEach(track => track.stop());
        liveStream = null;
    }
}

function takePhoto() {
    const video = document.getElementById("live-video");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    closeLiveCamera();

    if (!cv) {
        guardarImagen(canvas, "⚠️");
        return;
    }

    try {
        procesarConOpenCV(canvas);
    } catch (e) {
        console.error("OpenCV error:", e);
        guardarImagen(canvas, "❌");
    }
}

function guardarImagen(canvas, estado = "✅") {
    const calidad = currentDoc === "Contrato laboral" ? 1.0 : 0.7;
    const dataUrl = canvas.toDataURL("image/jpeg", calidad);
    images[currentDoc] = dataUrl;

    const safeId = currentDoc.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_");
    document.getElementById("preview-" + safeId).src = dataUrl;
    document.getElementById("preview-" + safeId).style.display = "block";
    document.getElementById("status-" + safeId).textContent = estado;
}

function procesarConOpenCV(canvas) {
    const src = cv.imread(canvas);
    let dst = new cv.Mat();
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let canny = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0);
    cv.Canny(blurred, canny, 75, 200, 3, false);
    cv.findContours(canny, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0, bestContour = null;
    for (let i = 0; i < contours.size(); ++i) {
        let c = contours.get(i);
        let area = cv.contourArea(c);
        if (area < 1000) continue;
        let approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
        if (approx.rows === 4 && area > maxArea) {
            maxArea = area;
            bestContour = approx.clone();
        }
        approx.delete();
    }

    if (bestContour) {
        const pts = [];
        for (let i = 0; i < bestContour.rows; ++i)
            pts.push({ x: bestContour.data32S[i * 2], y: bestContour.data32S[i * 2 + 1] });

        pts.sort((a, b) => a.y - b.y);
        const [tl, tr] = pts.slice(0, 2).sort((a, b) => a.x - b.x);
        const [bl, br] = pts.slice(2).sort((a, b) => a.x - b.x);

        const width = Math.max(
            Math.hypot(tr.x - tl.x, tr.y - tl.y),
            Math.hypot(br.x - bl.x, br.y - bl.y)
        );
        const height = Math.max(
            Math.hypot(tr.x - br.x, tr.y - br.y),
            Math.hypot(tl.x - bl.x, tl.y - bl.y)
        );

        const dsize = new cv.Size(width, height);
        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);

        const M = cv.getPerspectiveTransform(srcTri, dstTri);
        cv.warpPerspective(src, dst, M, dsize);

        const outputCanvas = document.createElement("canvas");
        cv.imshow(outputCanvas, dst);
        guardarImagen(outputCanvas, "✅");

        srcTri.delete(); dstTri.delete(); M.delete(); bestContour.delete();
    } else {
        guardarImagen(canvas, "⚠️");
    }

    src.delete(); dst.delete(); gray.delete(); blurred.delete();
    canny.delete(); contours.delete(); hierarchy.delete();
}

function openCrop(docName) {
    const dataUrl = images[docName];
    if (!dataUrl) return alert("📷 Primero escanea el documento.");
    currentDoc = docName;
    const cropperImg = document.getElementById("cropper-image");
    document.getElementById("cropper-modal").style.display = "flex";

    cropperImg.onload = () => {
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropperImg, {
            viewMode: 1, autoCropArea: 0.9, movable: true, zoomable: true, background: false
        });
    };
    cropperImg.src = dataUrl;
}

function confirmCrop() {
    if (!cropper) return alert("⚠️ No hay área recortada.");
    const canvas = cropper.getCroppedCanvas();
    const calidad = currentDoc === "Contrato laboral" ? 1.0 : 0.7;
    const dataUrl = canvas.toDataURL("image/jpeg", calidad);
    images[currentDoc] = dataUrl;

    const safeId = currentDoc.replace(/[^\w\s]/gi, '').replace(/\s+/g, "_");
    document.getElementById("preview-" + safeId).src = dataUrl;
    document.getElementById("status-" + safeId).textContent = "🟩";
    closeCrop();
}

function closeCrop() {
    if (cropper) cropper.destroy();
    document.getElementById("cropper-modal").style.display = "none";
}

async function generateZip() {
    const zip = new JSZip();
    let i = 1;
    for (const [doc, data] of Object.entries(images)) {
        const base64 = data.split(',')[1];
        zip.file(`${i++}_${doc}.jpg`, base64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const sizeMB = blob.size / (1024 * 1024);
    if (sizeMB > 4) {
        alert(`⚠️ ZIP supera 4MB (${sizeMB.toFixed(2)} MB)`);
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "DocumentosEscaneados.zip";
    a.click();
}

function generatePDFs() {
    const { jsPDF } = window.jspdf;
    Object.entries(images).forEach(([doc, data], idx) => {
        const pdf = new jsPDF();
        const props = pdf.getImageProperties(data);
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = (props.height * pdfW) / props.width;
        pdf.addImage(data, "JPEG", 0, 0, pdfW, pdfH);
        pdf.save(`${idx + 1}_${doc}.pdf`);
    });
}
