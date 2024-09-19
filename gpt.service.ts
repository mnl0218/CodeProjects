import { Injectable } from '@nestjs/common';

import OpenAI from 'openai';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as fs from 'fs';
import type { Multer } from 'multer';

import {
  audioToTextUseCase,
  fileProcessingUseCase,
  generalStreamUseCase,
  minimalDataUseCase,
  orthographyCheckUseCase,
  filetoTextAWSUsecase,
  filetoTextAWSwithBucketUsecase
} from './use-cases';

import {
  AudioToTextDto,
  GeneralStreamDto,
  MinimalDataDto,
  OrthographyDto,
} from './dtos';

import * as Tesseract from 'tesseract.js';
import { imageToTextUseCase } from './use-cases/image-to-text.use-case';

@Injectable()
export class GptService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  async orthographyCheck(orthographyDto: OrthographyDto) {
    return await orthographyCheckUseCase(this.openai, {
      prompt: orthographyDto.prompt,
    });
  }
  async generalStream({ prompt }: GeneralStreamDto) {
    return await generalStreamUseCase(this.openai, { prompt });
  }
  async minimalData(minimalDataDto: MinimalDataDto) {
    return await minimalDataUseCase(this.openai, {
      prompt: minimalDataDto.prompt,
    });
  }
  async fileProcessing(prompt: string) {
    // const filePath = path.resolve(__dirname, '../../uploads/', `${fileId}.mp3`);
    // const wasFound = fs.existsSync(filePath);

    // if (!wasFound) throw new NotFoundException(`File ${fileId} not found`);
    // return filePath;
    return await fileProcessingUseCase(this.openai, {
      prompt: prompt,
    });
  }
  async extractTextFromPdf(filePath: string): Promise<string> {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    //console.log(data.text);
    return data.text;
  }

  async extractTextFromDocx(filePath: string): Promise<string> {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  async extractTextFromImage(imagePath: string): Promise<string> {
    try {
      const result = await Tesseract.recognize(imagePath, 'spa');
      return result.data.text;
    } catch (error) {
      console.error('Error recognizing image:', error);
      throw new Error('Failed to process image with Tesseract');
    }
  }
  async extractTextFromImageGPT(imageFile: Multer.File, prompt?: string) {
    return await imageToTextUseCase(this.openai, {
      prompt,
      imageFile: imageFile,
    });
  }

  async extractTextAWS(imageFile: Multer.File, prompt?: string) {
    return await filetoTextAWSUsecase({
      prompt,
      imageFile: imageFile,
  });
  }

  async extractTextAWSWithBucket(imageFile: Multer.File, prompt?: string) {
    return await filetoTextAWSwithBucketUsecase({
      prompt,
      imageFile: imageFile,
  });
  }

  async audioToText(audioFile: Multer.File, audioToTextDto?: AudioToTextDto) {
    const { prompt } = audioToTextDto;
    return await audioToTextUseCase(this.openai, {
      prompt,
      audioFile: audioFile,
    });
  }
}
