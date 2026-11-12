FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Pre-download and cache ADE20K + SAM models for offline/fast startup
RUN python -c "from transformers import OneFormerProcessor, OneFormerForUniversalSegmentation, SamProcessor, SamModel, SegformerImageProcessor, SegformerForSemanticSegmentation; \
  of='shi-labs/oneformer_ade20k_swin_large'; OneFormerProcessor.from_pretrained(of); OneFormerForUniversalSegmentation.from_pretrained(of); \
  sm='facebook/sam-vit-base'; SamProcessor.from_pretrained(sm); SamModel.from_pretrained(sm); \
  sg='nvidia/segformer-b0-finetuned-ade-512-512'; SegformerImageProcessor.from_pretrained(sg); SegformerForSemanticSegmentation.from_pretrained(sg)" || true

COPY . .

RUN mkdir -p generated_images

EXPOSE 8000
ENV PORT=8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
