"""Offline checks for the independent-voice preview workflow, not audio quality."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('independent_voice_renderer', ROOT / 'tools/render-independent-voices.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
PLAN = json.loads((ROOT / 'tools/independent-voice-probes.json').read_text(encoding='utf-8'))


class IndependentVoiceProbesTest(unittest.TestCase):
    def test_download_errors_keep_the_host_and_failure_without_signed_secrets(self):
        location = ROOT / 'tools/download-independent-voice-model.py'
        module_spec = importlib.util.spec_from_file_location('voice_model_download', location)
        downloader = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(downloader)
        examples = [
            "CONNECT 403 https://us.aws.cdn.hf.co/weights?Policy=TEMPORARY_SECRET&Signature=SIGNED_SECRET",
            "HTTPSConnectionPool(host='us.aws.cdn.hf.co', port=443): url: /weights?Policy=TEMPORARY_SECRET&Signature=SIGNED_SECRET (CONNECT 403)",
        ]
        for message in examples:
            result = downloader.safe_error(message)
            self.assertIn('us.aws.cdn.hf.co', result)
            self.assertIn('403', result)
            self.assertNotIn('TEMPORARY_SECRET', result)
            self.assertNotIn('SIGNED_SECRET', result)

    def test_all_six_excerpts_match_the_actual_pending_slots(self):
        slots = {row['id']: row for row in json.loads((ROOT / 'assets/chapter1-voice-plan.json').read_text(encoding='utf-8'))['slots']}
        voices = renderer.validate_plan(PLAN)
        self.assertEqual({voice['speaker']: voice['age'] for voice in voices}, {'Gideon': 12, 'Pacifica': 14})
        checked = 0
        for voice in voices:
            self.assertEqual(voice['anchorText'], ' '.join(sample['text'] for sample in voice['samples']))
            for sample in voice['samples']:
                row = slots[sample['id']]
                for key in ['script', 'language', 'sourceLine', 'text']:
                    self.assertEqual(sample[key], row[key])
                self.assertEqual(voice['speaker'], row['speaker'])
                self.assertFalse(row['approved'])
                checked += 1
        self.assertEqual(checked, 6)
        voices[0]['samples'][0]['text'] = 'Mutated result'
        self.assertNotEqual(voices[0]['samples'][0]['text'], PLAN['voices'][0]['samples'][0]['text'])

    def test_old_chapters_wrong_ages_and_changed_transcripts_are_rejected(self):
        mutations = [
            lambda p: p['voices'][0].update(age=11),
            lambda p: p['voices'][0]['samples'][0].update(script='chapter_1_v2/start'),
            lambda p: p['voices'][0]['samples'][0].update(script='chapter_0/intro'),
            lambda p: p['voices'][0]['samples'][0].update(language='english'),
            lambda p: p['voices'][0].update(anchorText='Substituted words'),
            lambda p: p['voices'][1]['samples'][0].update(id=p['voices'][0]['samples'][0]['id']),
        ]
        for mutation in mutations:
            plan = deepcopy(PLAN)
            mutation(plan)
            with self.subTest(plan=plan['voices'][0]['speaker']), self.assertRaises(ValueError):
                renderer.validate_plan(plan)

    def test_actor_recordings_and_reference_inputs_cannot_be_added(self):
        for key in ['ref_audio', 'audio_path', 'speaker_embedding', 'actor_name', 'voice_clone_prompt']:
            plan = deepcopy(PLAN)
            plan['voices'][0]['samples'][0][key] = 'assets/audio/Gideon_Hm_1.flac'
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'not accepted'):
                renderer.validate_plan(plan)

    def test_preview_output_cannot_overwrite_game_assets_even_through_symlinks(self):
        with self.assertRaises(ValueError):
            renderer.validate_output(ROOT / 'assets/voices/previews')
        with tempfile.TemporaryDirectory() as tmp:
            link = Path(tmp) / 'assets-alias'
            link.symlink_to(ROOT / 'assets', target_is_directory=True)
            with self.assertRaises(ValueError):
                renderer.validate_output(link / 'voices')

    def test_incomplete_models_fail_before_imports_or_output_creation(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / 'model'
            output = Path(tmp) / 'preview'
            with self.assertRaisesRegex(ValueError, 'No download was attempted'):
                renderer.render(PLAN, folder, output)
            self.assertFalse(output.exists())
            folder.mkdir()
            (folder / 'config.json').write_text(json.dumps({'model_type': 'qwen3_tts', 'tts_model_type': 'voice_design', 'tts_model_size': '1.7b'}))
            (folder / 'model.safetensors').touch()
            (folder / 'tokenizer_config.json').write_text('{}')
            (folder / 'tokenizer.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'speech_tokenizer'):
                renderer.validate_local_model(folder)

    def test_validation_cli_needs_no_model_or_heavy_dependencies_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'preview'
            result = subprocess.run([
                sys.executable, '-S', str(ROOT / 'tools/render-independent-voices.py'),
                '--plan', str(ROOT / 'tools/independent-voice-probes.json'),
                '--output', str(output), '--validate-only',
            ], text=True, capture_output=True, check=True)
            report = json.loads(result.stdout)
            self.assertEqual(report['speakers'], ['Gideon', 'Pacifica'])
            self.assertFalse(report['audioGenerated'])
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
