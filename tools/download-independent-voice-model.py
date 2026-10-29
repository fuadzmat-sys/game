"""Fetch the official text-to-voice-design model after network review.

The game and original actor recordings are never inputs. The model remains
outside the project checkout. By default only verify access and report metadata;
--download explicitly fetches the pinned model snapshot and its speech tokenizer.
"""
from __future__ import annotations
import argparse
import json
import logging
import os
from pathlib import Path
import re

MODEL_REPOSITORY = 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign'
OFFICIAL_CODE_REVISION = '022e286b98fbec7e1e916cb940cdf532cd9f488e'


def safe_error(error):
    """Keep failures useful without exposing temporary signed download URLs."""
    message = str(error)
    message = re.sub(r'https?://([^/\s\"\']+)[^\s\"\']*', r'https://\1/[download URL]', message)
    return re.sub(r'\?[^\s\"\')]+', '?[signed query redacted]', message)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path('/workspace/voice-models/qwen3-tts-independent-design'))
    parser.add_argument('--download', action='store_true', help='Download the complete model snapshot after checking its public metadata')
    args = parser.parse_args(argv)
    if args.directory.resolve().is_relative_to(Path(__file__).resolve().parents[1]):
        parser.error('Keep model weights outside the game checkout.')
    os.environ.setdefault('HF_HOME', '/workspace/voice-models/huggingface-cache')
    os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')
    # Use ordinary HTTPS downloads through the configured session proxy.
    os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
    # Retried HTTP warnings can contain entire short-lived signed CDN URLs.
    logging.getLogger('huggingface_hub').setLevel(logging.ERROR)
    try:
        from huggingface_hub import HfApi, snapshot_download
        info = HfApi().model_info(MODEL_REPOSITORY, files_metadata=True)
        if not info.sha:
            raise RuntimeError('The official model did not provide an immutable revision.')
        card = info.card_data.to_dict() if info.card_data is not None else {}
        files = info.siblings or []
        weights = [row for row in files if row.rfilename.endswith('.safetensors')]
        if not any(row.rfilename.startswith('speech_tokenizer/') for row in weights):
            raise RuntimeError('The selected snapshot lacks its required speech tokenizer weights.')
        receipt = {
            'repository': MODEL_REPOSITORY, 'revision': info.sha,
            'modelLicense': card.get('license'),
            'weightBytes': sum(row.size or 0 for row in weights),
            'officialCodeRevisionReviewed': OFFICIAL_CODE_REVISION,
            'purpose': 'Independently designed fictional character voice previews; no actor recordings.',
        }
        print(json.dumps(receipt, ensure_ascii=False, indent=2))
        if not args.download:
            return 0
        if not receipt['modelLicense']:
            raise RuntimeError('Model license metadata is missing; inspect the official card before downloading.')
        snapshot_download(
            repo_id=MODEL_REPOSITORY, revision=info.sha,
            local_dir=args.directory,
            allow_patterns=['*.json', '*.safetensors', '*.txt', '*.tiktoken', '*.model', 'LICENSE*', 'README.md'],
            max_workers=2,
        )
        (args.directory / 'download-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('Downloaded official model and tokenizer to', args.directory)
        return 0
    except Exception as error:
        print('Model access/download failed:', safe_error(error))
        print('Use the configured proxy and TLS trust. If access is denied, review the reported host. Current official download hosts: huggingface.co, cas-bridge.xethub.hf.co, us.aws.cdn.hf.co.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
