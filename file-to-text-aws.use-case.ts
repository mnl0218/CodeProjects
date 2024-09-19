import type { Multer } from 'multer';
import * as fs from 'fs';
import { TextractClient,AnalyzeDocumentCommand, StartDocumentAnalysisCommand, GetDocumentAnalysisCommand, FeatureType } from "@aws-sdk/client-textract";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

interface Options {
  prompt?: string;
  imageFile: Multer.File;
};


export const filetoTextAWSUsecase = async (
  Options: Options,
)=>{
  const { prompt, imageFile } = Options;
  const awsClient = new TextractClient({ region: "us-east-1" }); 

  const params = {
    Document: {
      Bytes: fs.readFileSync(imageFile.path),
    },
    FeatureTypes: [FeatureType.TABLES, FeatureType.FORMS,FeatureType.LAYOUT,FeatureType.SIGNATURES]
  };


  try {
    const command = new AnalyzeDocumentCommand(params);
    const response = await awsClient.send(command);
    let extractedText = '';
    if (response.Blocks) {
      for (const block of response.Blocks) {
        if (block.BlockType === "LINE") {
          extractedText += block.Text + ' ';
          //extractedText.push(block.Text);
        }
      }
    }
    return { CONTENIDO: extractedText }; 
  } catch (error) {
    throw error; 
  }
};

export const filetoTextAWSwithBucketUsecase = async (
  Options: Options,
)=>{
  const { prompt, imageFile } = Options;

  // Cliente de AWS Textract
  const textractClient = new TextractClient({ region: "us-east-1" });
  const s3Client = new S3Client({ region: 'us-east-1' });

  // Nombre del bucket y archivo
  const bucketName = 'analitica.excelcredit'; // Reemplaza con tu bucket S3
  const folderName = 'textract_documents'; // Nombre de la carpeta dentro del bucket
  const fileName = imageFile.originalname; 
  const s3ObjectKey = `${folderName}/${fileName}`; // Clave completa del objeto en S3

  try {
    const uploadParams = {
      Bucket: bucketName,
      Key: s3ObjectKey,
      Body: fs.readFileSync(imageFile.path), 
    };

    const uploadCommand = new PutObjectCommand(uploadParams);
    await s3Client.send(uploadCommand);
    console.log('Archivo subido a S3:', s3ObjectKey);

    // Parámetros para iniciar el análisis del documento
    const startParams = {
      DocumentLocation: {
        S3Object: {
          Bucket: bucketName,
          Name: s3ObjectKey, // Usamos la clave completa aquí
        },
      },
      FeatureTypes: [FeatureType.TABLES, FeatureType.FORMS, FeatureType.LAYOUT, FeatureType.SIGNATURES],
    };

    // Iniciar análisis asíncrono
    const startCommand = new StartDocumentAnalysisCommand(startParams);
    const startResponse = await textractClient.send(startCommand);
    const jobId = startResponse.JobId;

    // Obtener resultados del análisis (paginación incluida)
    interface GetParams {
      JobId: string;
      NextToken?: string; 
    }
    let analysisComplete = false;
    let getParams: GetParams = { JobId: jobId }; 
    let extractedText = '';

    while (!analysisComplete) {
      const getCommand = new GetDocumentAnalysisCommand(getParams);
      const analysisResponse = await textractClient.send(getCommand);

      if (analysisResponse.JobStatus === 'SUCCEEDED') {
        // Procesar los bloques de texto
        if (analysisResponse.Blocks) {
          for (const block of analysisResponse.Blocks) {
            if (block.BlockType === "LINE") {
              extractedText += block.Text + ' ';
            }
          }
        }

        // Si hay más páginas (NextToken), continuar obteniendo los resultados
        if (analysisResponse.NextToken) {
          getParams.NextToken = analysisResponse.NextToken;
        } else {
          analysisComplete = true;
        }
      } else if (analysisResponse.JobStatus === 'FAILED') {
        throw new Error(`Análisis de documento fallido: ${analysisResponse.StatusMessage}`);
      } else {
        // El análisis sigue en progreso, esperar antes de verificar de nuevo
        await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
      }
    }

    // Retornar el texto extraído
    return { CONTENIDO: extractedText };
  } catch (error) {
    console.error('Error procesando el documento:', error);
    throw error;
  }
};

