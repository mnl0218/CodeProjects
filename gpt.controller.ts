import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Multer } from 'multer'; // Import Multer type
import { diskStorage } from 'multer';
import { GptService } from './gpt.service';
import * as fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import {
  AudioToTextDto,
  GeneralStreamDto,
  MinimalDataDto,
  OrthographyDto,
} from './dtos';

@Controller('gpt')
export class GptController {
  constructor(private readonly gptService: GptService) { }

  @Post('orthography-check')
  orthographyCheck(@Body() orthographyDto: OrthographyDto) {
    return this.gptService.orthographyCheck(orthographyDto);
  }

  @Post('general-stream')
  async generalStream(
    @Body() generalStreamDto: GeneralStreamDto,
    @Res() res: Response,
  ) {
    const stream = await this.gptService.generalStream(generalStreamDto);
    res.setHeader('Content-Type', 'application/json');
    res.status(HttpStatus.OK);
    for await (const chunk of stream) {
      const piece = chunk.choices[0].delta.content || '';
      console.log(piece);
      res.write(piece);
    }
    res.end();
  }

  @Post('minimal-data')
  minimalData(@Body() minimalDataDto: MinimalDataDto) {
    return this.gptService.minimalData(minimalDataDto);
  }

  @Post('file-processing')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'files', maxCount: 20 }], // Ajusta maxCount según sea necesario
      {

        storage: diskStorage({
          destination: (req, file, callback) => {
            const uploadPath = './uploads';
            if (!fs.existsSync(uploadPath)) {
              fs.mkdirSync(uploadPath, { recursive: true });
            }
            callback(null, uploadPath);
          },
          filename: (req, file, callback) => {
            const originalFileNameWithoutExtension = file.originalname
              .split('.')
              .slice(0, -1)
              .join('.');
            const fileExtension = file.originalname.split('.').pop();
            const filename = `${originalFileNameWithoutExtension}-${Date.now()}.${fileExtension}`;
            console.log(filename)
            callback(null, filename);
          },
        }),
        limits: {
          fileSize: 1000 * 1024 * 5, // Limitar tamaño de archivo a 5 MB
        },
      },
    ),
  )
  async fileProcessing(
    @UploadedFiles() files: { files?: Multer.File[] }, // Ahora accedemos a files.files
    @Body() audioToTextDto: AudioToTextDto,
  ) {
    let extractedText = `
    
    `;
    if (!files || !files.files || files.files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }
    for (const file of files.files) {
      try {
        console.log(`Processing file: ${file.originalname}`);
        const fileExtension = file.originalname.split('.').pop().toLowerCase();
        console.log(`File extension: ${fileExtension}`);
        console.log(`Stored at: ${file.path}`);
        if (fileExtension === 'pdf') {
          const pdfText = await this.gptService.extractTextFromPdf(file.path);

          if (pdfText.trim() === '') {
            const pdfBytes = fs.readFileSync(file.path);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const totalPages = pdfDoc.getPageCount();
            if (totalPages > 1) {
              const awsResult = await this.gptService.extractTextAWSWithBucket(file);
              extractedText += ` NOMBRE DOCUMENTO: ${file.originalname}
              CONTENIDO: [`;
              extractedText += JSON.stringify(awsResult); 
              extractedText += `]
              `;
            } else {
              const awsResult = await this.gptService.extractTextAWS(file);
              extractedText += ` NOMBRE DOCUMENTO: ${file.originalname}
              CONTENIDO: [`;
              extractedText += JSON.stringify(awsResult); 
              extractedText += `]
              `;
            }
           } else {
              extractedText += ` NOMBRE DOCUMENTO: ${file.originalname}
              CONTENIDO: [`;
              extractedText += pdfText;
              extractedText += `]
              `;
            }
          
        } else if (fileExtension === 'docx') {
          extractedText += ` NOMBRE DOCUMENTO: ${file.originalname}
        CONTENIDO: [`;
          extractedText += await this.gptService.extractTextFromDocx(file.path);
          extractedText += `]
        
        `;
        } else if (fileExtension === 'm4a' || fileExtension === 'mp3') {
          const transcription = await this.gptService.audioToText(
            file,
            audioToTextDto,
          );
          extractedText += ` NOMBRE DOCUMENTO: ${file.originalname}
        CONTENIDO: [`;
          extractedText += transcription + '';
          extractedText += `]
        
        `;
        } else if (
          fileExtension === 'png' ||
          fileExtension === 'jpg' ||
          fileExtension === 'jpeg' ||
          fileExtension === 'gif'  
        ) {
          extractedText += ` NOMBRE DOCUMENTO: ${file.originalname}
        CONTENIDO: [`;
          extractedText +=
            JSON.stringify(await this.gptService.extractTextAWS(file)) +
            '';
          extractedText += `]
        
        `;
        } else {
          throw new BadRequestException(
            `Unsupported file type: ${fileExtension} `,
          );
        }
      } catch (error) {
        console.error(`Error processing file: ${file.originalname}`, error);
        throw new BadRequestException(
          `Error processing file: ${file.originalname}`,
        );
      }
    }
    console.log(extractedText);
    return await this.gptService.fileProcessing(extractedText);
  }
}
