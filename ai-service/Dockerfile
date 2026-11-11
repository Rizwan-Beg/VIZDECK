FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Pre-download and cache SegFormer ADE20K model for offline/fast startup
RUN python -c "from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation; model_id='nvidia/segformer-b0-finetuned-ade-512-512'; SegformerImageProcessor.from_pretrained(model_id); SegformerForSemanticSegmentation.from_pretrained(model_id)" || true

COPY . .

RUN mkdir -p generated_images

EXPOSE 8000
ENV PORT=8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
