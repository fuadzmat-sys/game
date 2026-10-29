"""Render unreviewed, independently designed Chapter 1 voice probes.

Only descriptions and exact new Chapter 1 text are accepted. No actor recording,
reference audio, original-game voice, or cloning API is used. The official Qwen3
VoiceDesign model must already exist locally; this program never downloads it.
CPU performance and voice quality require actual rendering and listening.

The WAV preserves the generated floating-point waveform without pitch, tempo,
normalization, or other voice processing. Optional MP3 is a listening copy.
Neither output is a game asset or an approved recording.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
OFFICIAL_SOURCE = "https://github.com/QwenLM/Qwen3-TTS"
SOURCE_REVISION = "022e286b98fbec7e1e916cb940cdf532cd9f488e"
CAST = {"Gideon": 12, "Pacifica": 14}
FORBIDDEN_FIELDS = {
    "audio", "audio_path", "audio_url", "ref_audio", "reference_audio",
    "reference_file", "reference_path", "voice_clone_prompt", "speaker_embedding",
    "speaker_id", "voice_id", "actor", "actor_name", "celebrity", "celebrity_name",
}


def _reject_audio_inputs(value, path="plan"):
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in FORBIDDEN_FIELDS:
                raise ValueError(f"{path}.{key}: audio references and actor identities are not accepted")
            _reject_audio_inputs(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_audio_inputs(child, f"{path}[{index}]")


def validate_plan(plan):
    """Return a copied list of the two validated text-designed voice plans."""
    if not isinstance(plan, dict):
        raise ValueError("The probe plan must be a JSON object")
    _reject_audio_inputs(plan)
    if plan.get("version") != 1 or plan.get("status") != "preview_plan":
        raise ValueError("Expected version 1 with status preview_plan")
    if plan.get("language") != "Russian" or plan.get("referencePolicy") != "text_designed_only":
        raise ValueError("Expected Russian probes with referencePolicy text_designed_only")
    voices = plan.get("voices")
    if not isinstance(voices, list) or len(voices) != 2:
        raise ValueError("The preview must contain exactly Gideon and Pacifica")
    speakers, sample_ids = set(), set()
    for voice in voices:
        if not isinstance(voice, dict):
            raise ValueError("Each voice must be a JSON object")
        speaker = voice.get("speaker")
        if speaker not in CAST or speaker in speakers:
            raise ValueError("The preview must contain Gideon and Pacifica exactly once")
        speakers.add(speaker)
        if type(voice.get("age")) is not int or voice["age"] != CAST[speaker]:
            raise ValueError(f"{speaker}: the canon age is {CAST[speaker]}")
        if type(voice.get("seed")) is not int or not 0 <= voice["seed"] < 2**32:
            raise ValueError(f"{speaker}: seed must be an integer in [0, 2**32)")
        if not isinstance(voice.get("description"), str) or not voice["description"].strip():
            raise ValueError(f"{speaker}: a nonempty independent voice description is required")
        samples = voice.get("samples")
        if not isinstance(samples, list) or len(samples) != 3:
            raise ValueError(f"{speaker}: exactly three diagnostic source lines are required")
        texts = []
        for sample in samples:
            if not isinstance(sample, dict):
                raise ValueError(f"{speaker}: each source sample must be an object")
            sample_id = sample.get("id")
            if not isinstance(sample_id, str) or not sample_id.strip() or sample_id in sample_ids:
                raise ValueError(f"{speaker}: sample IDs must be nonempty and unique")
            sample_ids.add(sample_id)
            script = sample.get("script")
            if not isinstance(script, str) or not re.fullmatch(r"chapter_1_v3/[a-z_]+", script):
                raise ValueError(f"{speaker}: sample scripts must belong to the new chapter_1_v3")
            if sample.get("language") != "russian":
                raise ValueError(f"{speaker}: sample language must be russian")
            if type(sample.get("sourceLine")) is not int or sample["sourceLine"] < 1:
                raise ValueError(f"{speaker}: sourceLine must be a positive integer")
            for key in ["text", "direction"]:
                if not isinstance(sample.get(key), str) or not sample[key].strip():
                    raise ValueError(f"{speaker}: each sample needs nonempty {key}")
            texts.append(sample["text"])
        if voice.get("anchorText") not in ["\n".join(texts), " ".join(texts)]:
            raise ValueError(f"{speaker}: anchorText must join the three exact source texts")
    return deepcopy(voices)


def validate_output(output):
    """Validate a preview destination without creating or modifying it."""
    path = Path(output).expanduser().resolve()
    assets = (PROJECT_ROOT / "assets").resolve()
    if path == assets or assets in path.parents:
        raise ValueError("Preview output must be outside the game's assets directory")
    if path.exists() and not path.is_dir():
        raise ValueError("Preview output must name a directory")
    return path


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _require_weights(folder):
    weights = list(folder.glob("*.safetensors"))
    if not weights:
        raise ValueError(f"No local safetensors weights in {folder}")
    for index in folder.glob("*.safetensors.index.json"):
        data = json.loads(index.read_text(encoding="utf-8"))
        shards = set(data.get("weight_map", {}).values())
        if not shards or any(not (folder / shard).is_file() for shard in shards):
            raise ValueError(f"Incomplete local weight shards listed by {index}")


def validate_local_model(model):
    """Require complete local VoiceDesign inputs; never resolve a Hub model ID."""
    folder = Path(model).expanduser().resolve()
    if not folder.is_dir() or not (folder / "config.json").is_file():
        raise ValueError(
            f"Local VoiceDesign model is missing at {folder}. After the model-host network "
            "review is applied, download the official model separately and pass its complete "
            "local directory with --model. No download was attempted."
        )
    config = json.loads((folder / "config.json").read_text(encoding="utf-8"))
    if config.get("model_type") != "qwen3_tts" or config.get("tts_model_type") != "voice_design":
        raise ValueError("Only the official Qwen3-TTS VoiceDesign model is accepted; Base/cloning models are not used")
    if str(config.get("tts_model_size", "")).lower() not in {"1.7b", "1b7"}:
        raise ValueError("This preview workflow requires Qwen3-TTS 1.7B VoiceDesign")
    _require_weights(folder)
    if not (folder / "tokenizer_config.json").is_file() or not any((folder / name).is_file() for name in ["tokenizer.json", "vocab.json"]):
        raise ValueError("The local model is missing its text tokenizer files")
    codec = folder / "speech_tokenizer"
    if not (codec / "config.json").is_file():
        raise ValueError("The local model must include speech_tokenizer/config.json and its weights")
    _require_weights(codec)
    result = {
        "directory": str(folder), "modelId": MODEL_ID,
        "configSha256": sha256(folder / "config.json"),
        "speechTokenizerConfigSha256": sha256(codec / "config.json"),
    }
    receipt_path = folder / "download-receipt.json"
    if receipt_path.is_file():
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt.get("repository") != MODEL_ID or not re.fullmatch(r"[a-f0-9]{40}", str(receipt.get("revision", ""))):
            raise ValueError("The local download receipt must identify the official model and an immutable revision")
        result["downloadReceipt"] = {key: receipt[key] for key in ["repository", "revision", "modelLicense", "weightBytes"] if key in receipt}
    return result


def render(plan, model_directory, output_directory, *, threads=4, max_new_tokens=512):
    """Generate only unreviewed probes, using descriptions and local weights."""
    voices = validate_plan(plan)
    output = validate_output(output_directory)
    model_info = validate_local_model(model_directory)
    if type(threads) is not int or not 1 <= threads <= 64:
        raise ValueError("threads must be an integer between 1 and 64")
    if type(max_new_tokens) is not int or not 1 <= max_new_tokens <= 4096:
        raise ValueError("max_new_tokens must be an integer between 1 and 4096")
    # The wrapper also loads a processor and codec. Offline guards cover those
    # nested loaders even where upstream does not forward local_files_only.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    try:
        import numpy as np
        import soundfile as sf
        import torch
        from qwen_tts import Qwen3TTSModel
    except ImportError as error:
        raise RuntimeError("Install the isolated CPU environment from tools/independent-voice-requirements.txt first") from error
    if metadata.version("qwen-tts") != "0.1.1":
        raise RuntimeError("This preview workflow was prepared for qwen-tts==0.1.1")
    torch.set_num_threads(threads)
    model = Qwen3TTSModel.from_pretrained(
        model_info["directory"], device_map="cpu", dtype=torch.float32,
        attn_implementation="eager", local_files_only=True, use_safetensors=True,
    )
    output.mkdir(parents=True, exist_ok=True)
    report = {
        "version": 1, "status": "unreviewed_previews", "approved": False,
        "referencePolicy": "text_designed_only", "language": "Russian",
        "backend": "Qwen3-TTS VoiceDesign; local CPU float32/eager",
        "source": OFFICIAL_SOURCE, "sourceRevisionReviewed": SOURCE_REVISION,
        "model": model_info, "threads": threads, "maxNewTokens": max_new_tokens,
        "packages": {name: metadata.version(name) for name in ["qwen-tts", "torch", "torchaudio", "transformers", "soundfile"]},
        "processing": "Unprocessed float32 WAV; optional MP3 encoding only. No pitch or tempo processing.",
        "quality": "Not approved; age, acting and naturalness require listening to the rendered probes.",
        "planSha256": hashlib.sha256(json.dumps(plan, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
        "voices": [],
    }
    ffmpeg = shutil.which("ffmpeg")
    for voice in voices:
        torch.manual_seed(voice["seed"])
        started = time.monotonic()
        waves, rate = model.generate_voice_design(
            text=voice["anchorText"], language="Russian", instruct=voice["description"],
            non_streaming_mode=True, max_new_tokens=max_new_tokens,
        )
        if len(waves) != 1 or type(rate) is not int or rate <= 0:
            raise RuntimeError(f"{voice['speaker']}: the model did not return one valid waveform")
        wave = np.asarray(waves[0])
        if wave.ndim != 1 or not wave.size or not np.isfinite(wave).all():
            raise RuntimeError(f"{voice['speaker']}: the model returned empty or invalid audio")
        stem = f"{voice['speaker'].lower()}-{voice['seed']}"
        wav = output / f"{stem}.wav"
        sf.write(wav, wave, rate, format="WAV", subtype="FLOAT")
        row = {
            **voice, "status": "unreviewed_preview", "approved": False,
            "wav": wav.name, "wavSha256": sha256(wav), "sampleRate": rate,
            "sampleCount": int(wave.size), "duration": round(wave.size / rate, 6),
            "renderSeconds": round(time.monotonic() - started, 3),
            "peak": float(np.max(np.abs(wave))), "mp3": None,
        }
        if ffmpeg:
            mp3 = output / f"{stem}.mp3"
            subprocess.run(
                [ffmpeg, "-v", "error", "-nostdin", "-y", "-i", str(wav),
                 "-map_metadata", "-1", "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3)],
                check=True, capture_output=True, text=True,
            )
            row.update(mp3=mp3.name, mp3Sha256=sha256(mp3))
        report["voices"].append(row)
        print(f"Rendered unreviewed {voice['speaker']} probe: {row['duration']:.2f}s audio", flush=True)
    (output / "preview-index.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--model", type=Path, help="Complete local official VoiceDesign model directory")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--validate-only", action="store_true", help="Validate without heavy imports, downloads or output files")
    args = parser.parse_args(argv)
    try:
        plan = json.loads(args.plan.read_text(encoding="utf-8"))
        voices = validate_plan(plan)
        output = validate_output(args.output)
        if args.validate_only:
            result = {"status": "valid_preview_plan", "speakers": [voice["speaker"] for voice in voices], "output": str(output), "audioGenerated": False}
            if args.model is not None:
                result["model"] = validate_local_model(args.model)
            print(json.dumps(result, ensure_ascii=False))
            return 0
        if args.model is None:
            raise ValueError("Rendering requires --model with complete local weights. No download was attempted.")
        render(plan, args.model, output, threads=args.threads, max_new_tokens=args.max_new_tokens)
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Voice preview failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
