import {HeadlessEntryPointRegistry} from '@amazon-devices/headless-task-manager';
import {onStartCueService, onStopCueService} from './src/headless/CueService';

HeadlessEntryPointRegistry.registerHeadlessEntryPoint2(
  'com.clutch.tv.cue.service::onStartService',
  () => onStartCueService,
);
HeadlessEntryPointRegistry.registerHeadlessEntryPoint2(
  'com.clutch.tv.cue.service::onStopService',
  () => onStopCueService,
);
