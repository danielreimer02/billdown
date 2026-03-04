FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (libxcb needed by Docling for image processing)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    libxcb1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Docling models + EasyOCR English models so they're baked into the image
RUN python -c "\
from docling.datamodel.base_models import InputFormat; \
from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions; \
from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption; \
ocr = EasyOcrOptions(lang=['en'], use_gpu=False); \
opts = PdfPipelineOptions(ocr_options=ocr); \
DocumentConverter(format_options={ \
    InputFormat.IMAGE: ImageFormatOption(pipeline_options=opts), \
    InputFormat.PDF: PdfFormatOption(pipeline_options=opts), \
})" && \
python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

COPY . .

EXPOSE 8000
